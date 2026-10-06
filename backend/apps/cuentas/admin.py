from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Docente, Institucion


@admin.register(Institucion)
class InstitucionAdmin(admin.ModelAdmin):
    list_display = ["nombre", "municipio", "nit", "usa_ia_nube"]
    search_fields = ["nombre", "nit"]


@admin.register(Docente)
class DocenteAdmin(UserAdmin):
    list_display = ["username", "first_name", "last_name", "email", "institucion", "is_staff"]
    list_filter = ["institucion", "is_staff", "is_active"]
    fieldsets = UserAdmin.fieldsets + (("Institución", {"fields": ["institucion"]}),)
