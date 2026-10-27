export type Session = {
  signedIn: () => boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  token: () => Promise<string | undefined>
}
