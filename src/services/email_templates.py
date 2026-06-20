"""HTML and plain-text templates for classic auth emails."""

from __future__ import annotations


def _shell(title: str, body_html: str, brand: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"/><title>{title}</title></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:Segoe UI,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:8px;overflow:hidden;
        box-shadow:0 4px 24px rgba(15,23,42,0.08);">
        <tr><td style="background:#ed1c24;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">{brand}</p>
        </td></tr>
        <tr><td style="padding:32px;color:#334155;font-size:15px;line-height:1.6;">{body_html}</td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
          Message automatique — ne pas répondre.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def verification_email(
    *,
    full_name: str,
    verify_url: str,
    expires_hours: int,
    brand: str,
) -> tuple[str, str, str]:
    subject = f"{brand} — Verify your email address"
    text = (
        f"Hello {full_name},\n\n"
        f"Thank you for registering on {brand}.\n"
        f"Open this link to activate your account:\n{verify_url}\n\n"
        f"This link expires in {expires_hours} hour(s).\n"
        f"If you did not create an account, ignore this email.\n\n— {brand}"
    )
    html = _shell(
        "Verify your account",
        f"<p>Hello <strong>{full_name}</strong>,</p>"
        f"<p>Thank you for registering. Click the button below to verify your email address:</p>"
        f'<p style="text-align:center;margin:28px 0;">'
        f'<a href="{verify_url}" style="background:#ed1c24;color:#fff;padding:14px 28px;border-radius:6px;'
        f'text-decoration:none;font-weight:bold;display:inline-block;">Verify my account</a></p>'
        f'<p style="font-size:13px;color:#64748b;">Or copy this link:<br/>'
        f'<span style="word-break:break-all;">{verify_url}</span></p>'
        f"<p>This link expires in <strong>{expires_hours} hour(s)</strong>.</p>",
        brand,
    )
    return subject, text, html


def password_reset_email(
    *,
    full_name: str,
    reset_url: str,
    expires_hours: int,
    brand: str,
) -> tuple[str, str, str]:
    subject = f"{brand} — Password reset"
    text = (
        f"Hello {full_name},\n\n"
        f"We received a password reset request for your account.\n"
        f"Open this link to choose a new password:\n{reset_url}\n\n"
        f"This link expires in {expires_hours} hour(s).\n"
        f"If you did not request a reset, ignore this email.\n\n— {brand}"
    )
    html = _shell(
        "Password reset",
        f"<p>Hello <strong>{full_name}</strong>,</p>"
        f"<p>We received a request to reset your password.</p>"
        f'<p style="text-align:center;margin:28px 0;">'
        f'<a href="{reset_url}" style="background:#ed1c24;color:#fff;padding:14px 28px;border-radius:6px;'
        f'text-decoration:none;font-weight:bold;display:inline-block;">Reset password</a></p>'
        f'<p style="font-size:13px;color:#64748b;">Or copy this link:<br/>'
        f'<span style="word-break:break-all;">{reset_url}</span></p>'
        f"<p>This link expires in <strong>{expires_hours} hour(s)</strong>.</p>"
        f"<p>If you did not request this reset, you can safely ignore this email.</p>",
        brand,
    )
    return subject, text, html
