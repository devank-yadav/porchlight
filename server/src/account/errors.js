// An error with an HTTP status; wrap() sends its message to the app.
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; this.expose = true; }
}
