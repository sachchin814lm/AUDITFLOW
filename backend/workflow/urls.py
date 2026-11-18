"""
URL routing for AuditFlow API endpoints.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework.authtoken.views import obtain_auth_token
from . import views

router = DefaultRouter()
router.register(r"definitions", views.WorkflowDefinitionViewSet, basename="definition")
router.register(r"instances", views.WorkflowInstanceViewSet, basename="instance")

urlpatterns = [
    # Authentication & User Management
    path("token/", obtain_auth_token, name="api-token"),
    path("register/", views.register_view, name="api-register"),
    path("me/", views.me_view, name="api-me"),
    path("users/", views.users_list_view, name="api-users"),

    # Global Ledger Verification
    path("ledger/verify/", views.verify_ledger_view, name="api-ledger-verify"),

    # ViewSet routes
    path("", include(router.urls)),
]
