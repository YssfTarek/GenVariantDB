from __future__ import absolute_import, unicode_literals

# This will make sure the app is always imported when
# Django starts
from .celery import app as GenVariantDB_backend

__all__ = ['GenVariantDB_backend']