import logging
import smtplib
import os
import re
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from html import escape

logger = logging.getLogger(__name__)

# Thread-safe list of active SMTP threads for cleanup
_smtp_threads = []
_smtp_threads_lock = threading.Lock()


def _sanitize_email_header(value):
    """Strip control characters from email header values to prevent header injection."""
    if value is None:
        return ""
    return re.sub(r"[\x00-\x1f\x7f]", "", str(value))


def _cleanup_smtp_threads():
    """Remove finished thread references to prevent memory leak."""
    with _smtp_threads_lock:
        _smtp_threads[:] = [t for t in _smtp_threads if t.is_alive()]


def send_email(subject, recipient, body_html, smtp_config=None):
    """
    Send an email. In dev mode, log to file.
    In production, send via SMTP if configured.
    """
    logs_folder = smtp_config.get("logs_folder") if smtp_config else None
    if logs_folder:
        log_line = f"To: {recipient} | Subject: {subject}\nHTML Body:\n{body_html}\n{'='*80}\n"
        try:
            log_file = os.path.join(logs_folder, "email_log.txt")
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(log_line)
        except Exception as e:
            logger.error("Failed to log email: %s", e)

    if smtp_config and smtp_config.get("host"):
        host = smtp_config["host"]
        port = smtp_config.get("port")
        user = smtp_config.get("user")
        pwd = smtp_config.get("password")
        sender = smtp_config.get("sender", "noreply@shibanifashion.com")

        missing = []
        if not port:
            missing.append("SMTP_PORT")
        if not user:
            missing.append("SMTP_USER")
        if not pwd:
            missing.append("SMTP_PASSWORD")
        if missing:
            msg = f"SMTP configured but missing: {', '.join(missing)}"
            logger.error(msg)
            raise ValueError(msg)

        def _send():
            try:
                safe_subject = _sanitize_email_header(subject)
                safe_sender = _sanitize_email_header(sender)
                safe_recipient = _sanitize_email_header(recipient)
                msg = MIMEMultipart("alternative")
                msg["Subject"] = safe_subject
                msg["From"] = safe_sender
                msg["To"] = safe_recipient
                msg.attach(MIMEText(body_html, "html"))
                port_int = int(port)
                server = None
                try:
                    if port_int == 465:
                        server = smtplib.SMTP_SSL(host, port_int, timeout=10)
                    else:
                        server = smtplib.SMTP(host, port_int, timeout=10)
                        server.starttls()
                    if user and pwd:
                        server.login(user, pwd)
                    server.sendmail(sender, [recipient], msg.as_string())
                finally:
                    if server is not None:
                        server.quit()
            except Exception as ex:
                logger.error("SMTP email fail to %s: %s", recipient, ex)

        _smtp_threads.append(threading.Thread(target=_send, daemon=True))
        _smtp_threads[-1].start()


def send_verification_email(username, email, token, smtp_config=None, url_root=""):
    url = f"{url_root.rstrip('/')}/verify-email?token={token}"
    safe_name = escape(username)
    body = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #f0f0f0; border-radius: 12px; padding: 24px;">
        <h2 style="color: #4f46e5; margin-bottom: 8px;">Welcome to Shibani Fashion!</h2>
        <p style="color: #475569; font-size: 14px;">Hello {safe_name}, thank you for registering.</p>
        <p style="color: #475569; font-size: 14px; margin-bottom: 24px;">Verify your email to activate your account:</p>
        <a href="{url}" style="display: inline-block; background-color: #4f46e5; color: white; text-decoration: none; font-weight: bold; font-size: 14px; padding: 12px 24px; border-radius: 8px;">Verify My Email</a>
        <div style="border-top: 1px solid #f0f0f0; margin-top: 24px; padding-top: 16px; font-size: 11px; color: #94a3b8;">
            If you did not sign up, please ignore this email.
        </div>
    </div>
    """
    send_email("Activate Your Shibani Fashion Account", email, body, smtp_config)


def send_reset_password_email(username, email, token, smtp_config=None, url_root=""):
    url = f"{url_root.rstrip('/')}/reset-password?token={token}"
    safe_name = escape(username)
    body = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #f0f0f0; border-radius: 12px; padding: 24px;">
        <h2 style="color: #4f46e5; margin-bottom: 8px;">Password Reset Request</h2>
        <p style="color: #475569; font-size: 14px;">Hello {safe_name}, reset your password (valid 1 hour):</p>
        <a href="{url}" style="display: inline-block; background-color: #4f46e5; color: white; text-decoration: none; font-weight: bold; font-size: 14px; padding: 12px 24px; border-radius: 8px;">Reset Password</a>
        <div style="border-top: 1px solid #f0f0f0; margin-top: 24px; padding-top: 16px; font-size: 11px; color: #94a3b8;">
            If you did not request this, ignore this email.
        </div>
    </div>
    """
    send_email("Reset Your Shibani Fashion Password", email, body, smtp_config)
