class ApiError(Exception):
    """Raise anywhere in a request; rendered as {"error": message, ...extra} with the status code."""

    def __init__(self, status, message, **extra):
        super().__init__(message)
        self.status = status
        self.message = message
        self.extra = extra
