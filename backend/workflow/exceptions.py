"""
Custom exceptions and exception handling for AuditFlow.
"""

from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


class ImmutableError(Exception):
    """
    Raised when an attempt is made to update, delete, or bulk-update
    entries in the append-only AuditLogLedger.
    """
    pass


def custom_exception_handler(exc, context):
    """
    Custom DRF exception handler mapping Python domain errors to HTTP statuses:
    - PermissionError -> 403 Forbidden
    - ValueError -> 400 Bad Request
    - Standard DRF exceptions are delegated to the default handler.
    """
    # Call REST framework's default exception handler first to get the standard response
    response = exception_handler(exc, context)
    if response is not None:
        return response

    if isinstance(exc, PermissionError):
        return Response(
            {"detail": str(exc)},
            status=status.HTTP_403_FORBIDDEN
        )

    if isinstance(exc, ValueError):
        return Response(
            {"detail": str(exc)},
            status=status.HTTP_400_BAD_REQUEST
        )

    if isinstance(exc, ImmutableError):
        return Response(
            {"detail": str(exc)},
            status=status.HTTP_400_BAD_REQUEST
        )

    return None
