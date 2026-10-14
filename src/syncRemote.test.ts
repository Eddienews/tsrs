import { describe, expect, it } from 'vitest'
import { bucketUrl, parsePropfind, signS3 } from './syncRemote'

// The examples in AWS's documentation of Signature Version 4 for S3.
const example = {
  accessKey: 'AKIAIOSFODNN7EXAMPLE',
  secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  date: '20130524T000000Z',
}

describe('signS3', () => {
  it('signs a GET with a signed header', async () => {
    const headers = await signS3({
      ...example,
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: { range: 'bytes=0-9' },
    })
    expect(headers.Authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    )
  })

  it('signs a listing with a query string', async () => {
    const headers = await signS3({
      ...example,
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J',
    })
    expect(headers.Authorization).toContain(
      'Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7',
    )
  })
})

describe('bucketUrl', () => {
  it('uses path style on custom endpoints and virtual hosts on AWS', () => {
    const config = { endpoint: '', region: 'sa-east-1', bucket: 'b', prefix: '', accessKey: '', secretKey: '' }
    expect(bucketUrl(config)).toBe('https://b.s3.sa-east-1.amazonaws.com')
    expect(bucketUrl({ ...config, endpoint: 'http://localhost:9000/' })).toBe('http://localhost:9000/b')
    expect(bucketUrl({ ...config, endpoint: 'x.r2.cloudflarestorage.com' })).toBe(
      'https://x.r2.cloudflarestorage.com/b',
    )
  })
})

describe('parsePropfind', () => {
  it('lists the files of a folder, whatever the namespace prefix', () => {
    const xml = `<?xml version="1.0"?>
      <D:multistatus xmlns:D="DAV:">
        <D:response><D:href>/dav/tsrs/</D:href>
          <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat>
        </D:response>
        <D:response><D:href>/dav/tsrs/chat~a~1.json</D:href>
          <D:propstat><D:prop><D:resourcetype/></D:prop></D:propstat>
        </D:response>
        <D:response><D:href>http://h/dav/tsrs/item%7Eprompt%7Ep%7E2.json</D:href>
          <D:propstat><D:prop><D:resourcetype/></D:prop></D:propstat>
        </D:response>
        <D:response><D:href>/dav/tsrs/sub/</D:href>
          <D:propstat><D:prop><D:resourcetype><D:collection /></D:resourcetype></D:prop></D:propstat>
        </D:response>
      </D:multistatus>`
    expect(parsePropfind(xml)).toEqual(['chat~a~1.json', 'item~prompt~p~2.json'])
    expect(parsePropfind(xml.replace(/D:/g, 'd:').replace(/xmlns:D/, 'xmlns:d'))).toHaveLength(2)
  })
})
