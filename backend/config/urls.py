from django.contrib import admin
from django.urls import path

admin.site.site_header = "AULA GLOBAL 360 · Administración"
admin.site.site_title = "AULA GLOBAL 360"

urlpatterns = [
    path("admin/", admin.site.urls),
]
