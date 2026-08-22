from cryptography.fernet import Fernet

from app.core.config import get_settings

_fernet = Fernet(get_settings().encryption_key)


def encrypt_secret(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    return _fernet.decrypt(value.encode()).decode()
