export const use = <T, _>(
  thenable: Promise<T> & {
    status?: 'pending' | 'fulfilled' | 'rejected'
    value?: T
    reason?: unknown
  }
): T => {
  switch (thenable.status) {
    case 'pending':
      throw thenable
    case 'fulfilled':
      return thenable.value as T
    case 'rejected':
      throw thenable.reason
    default:
      thenable.status = 'pending'
      thenable.then(
        v => {
          thenable.status = 'fulfilled'
          thenable.value = v
        },
        e => {
          thenable.status = 'rejected'
          thenable.reason = e
        }
      )
      throw thenable
  }
}
