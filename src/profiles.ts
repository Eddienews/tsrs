import { t } from './i18n'
import { ACTIVE_PROFILE, DEFAULT_PROFILE, deleteProfile, loadProfiles, saveProfiles, type Profile } from './storage'

// Switching, making, renaming and removing profiles. Settings and
// conversations are read once when the page loads, so changing profile
// reloads the page in the other one.

export function profileName(profile: Profile): string {
  return profile.name.trim() || (profile.id === DEFAULT_PROFILE ? t('Principal') : profile.id)
}

export function activeProfile(): Profile {
  const { list } = loadProfiles()
  return list.find((p) => p.id === ACTIVE_PROFILE) ?? list[0]
}

export function newProfileId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10)
}

export function switchProfile(id: string, reload = () => location.reload()): void {
  const profiles = loadProfiles()
  if (!profiles.list.some((p) => p.id === id) || id === ACTIVE_PROFILE) return
  saveProfiles({ ...profiles, active: id })
  reload()
}

export function createProfile(name: string, reload = () => location.reload()): string {
  const profiles = loadProfiles()
  const id = newProfileId()
  saveProfiles({ active: id, list: [...profiles.list, { id, name: name.trim() }] })
  reload()
  return id
}

export function renameProfile(id: string, name: string): void {
  const profiles = loadProfiles()
  saveProfiles({ ...profiles, list: profiles.list.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)) })
}

export { deleteProfile }
