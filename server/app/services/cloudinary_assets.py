from __future__ import annotations

from typing import BinaryIO
from uuid import uuid4

import cloudinary
import cloudinary.uploader

from app.config import get_settings


def _configure(*, signed: bool) -> None:
    settings = get_settings()
    if not settings.cloudinary_cloud_name.strip():
        raise RuntimeError("Set CLOUDINARY_CLOUD_NAME in server/.env")

    kwargs: dict[str, str | bool] = {
        "cloud_name": settings.cloudinary_cloud_name.strip(),
        "secure": True,
    }
    if signed:
        if not (settings.cloudinary_api_key.strip() and settings.cloudinary_api_secret.strip()):
            raise RuntimeError("Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET for signed uploads.")
        kwargs["api_key"] = settings.cloudinary_api_key.strip()
        kwargs["api_secret"] = settings.cloudinary_api_secret.strip()
    cloudinary.config(**kwargs)


def _friendly_error(exc: Exception) -> RuntimeError:
    text = str(exc)
    lower = text.lower()
    if "must supply api_key" in lower:
        return RuntimeError(
            "Cloudinary unsigned upload misconfigured. "
            "Ensure CLOUDINARY_UPLOAD_PRESET is set and the server was restarted."
        )
    if "missing permissions" in lower or "forbidden" in lower:
        return RuntimeError(
            "Cloudinary blocked upload (missing create permission). "
            "Use unsigned preset companyos, or grant create on the API key."
        )
    return RuntimeError(f"Cloudinary upload failed: {exc}")


def upload_logo(*, file: BinaryIO, organization_id: str, filename: str | None = None) -> dict[str, str]:
    settings = get_settings()
    preset = settings.cloudinary_upload_preset.strip()
    public_id = f"{settings.cloudinary_folder}/{organization_id}/logo-{uuid4().hex[:10]}"

    if preset:
        # Unsigned preset path — must use unsigned_upload (not upload).
        _configure(signed=False)
        options: dict = {
            "resource_type": "image",
            "public_id": public_id,
        }
        if filename:
            options["filename_override"] = filename
        try:
            result = cloudinary.uploader.unsigned_upload(file, preset, **options)
        except Exception as exc:
            raise _friendly_error(exc) from exc
    else:
        _configure(signed=True)
        folder = f"{settings.cloudinary_folder}/{organization_id}/logos"
        try:
            result = cloudinary.uploader.upload(
                file,
                folder=folder,
                public_id="primary",
                overwrite=True,
                invalidate=True,
                resource_type="image",
                filename_override=filename,
            )
        except Exception as exc:
            raise _friendly_error(exc) from exc

    return {
        "logo_url": str(result.get("secure_url") or result.get("url") or ""),
        "logo_public_id": str(result.get("public_id") or ""),
    }


def delete_logo(public_id: str) -> None:
    if not public_id.strip():
        return
    settings = get_settings()
    if not (settings.cloudinary_api_key.strip() and settings.cloudinary_api_secret.strip()):
        return
    try:
        _configure(signed=True)
        cloudinary.uploader.destroy(public_id, invalidate=True, resource_type="image")
    except Exception:
        pass


def upload_document(
    *,
    file: BinaryIO,
    organization_id: str,
    filename: str | None = None,
) -> dict[str, str]:
    """Upload a vault file (PDF/DOCX/etc.) as Cloudinary raw/auto resource."""
    settings = get_settings()
    public_id = f"{settings.cloudinary_folder}/{organization_id}/docs/{uuid4().hex[:12]}"

    # PDFs/DOCX need raw (or auto). Prefer signed upload; unsigned presets are often image-only.
    if settings.cloudinary_api_key.strip() and settings.cloudinary_api_secret.strip():
        _configure(signed=True)
        try:
            result = cloudinary.uploader.upload(
                file,
                public_id=public_id,
                resource_type="raw",
                type="upload",
                overwrite=False,
                filename_override=filename,
                use_filename=True,
                unique_filename=False,
            )
        except Exception as exc:
            # Fallback for accounts that reject raw.
            try:
                if hasattr(file, "seek"):
                    file.seek(0)
                result = cloudinary.uploader.upload(
                    file,
                    public_id=public_id,
                    resource_type="auto",
                    overwrite=False,
                    filename_override=filename,
                )
            except Exception:
                raise _friendly_error(exc) from exc
    else:
        preset = settings.cloudinary_upload_preset.strip()
        if not preset:
            raise RuntimeError(
                "Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (or an unsigned preset) for document uploads."
            )
        _configure(signed=False)
        try:
            result = cloudinary.uploader.unsigned_upload(
                file,
                preset,
                public_id=public_id,
                resource_type="raw",
                filename_override=filename,
            )
        except Exception as exc:
            raise _friendly_error(exc) from exc

    return {
        "file_url": str(result.get("secure_url") or result.get("url") or ""),
        "file_public_id": str(result.get("public_id") or ""),
        "bytes": str(result.get("bytes") or ""),
        "format": str(result.get("format") or ""),
    }


def delete_document(public_id: str) -> None:
    if not public_id.strip():
        return
    settings = get_settings()
    if not (settings.cloudinary_api_key.strip() and settings.cloudinary_api_secret.strip()):
        return
    try:
        _configure(signed=True)
        # Try raw then image — vault may store either depending on format.
        cloudinary.uploader.destroy(public_id, invalidate=True, resource_type="raw")
        cloudinary.uploader.destroy(public_id, invalidate=True, resource_type="image")
        cloudinary.uploader.destroy(public_id, invalidate=True, resource_type="auto")
    except Exception:
        pass
