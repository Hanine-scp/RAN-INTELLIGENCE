import base64
from pathlib import Path


def get_base64_image(image_path: str) -> str:
    """
    Reads an image file and returns its Base64 string representation.
    """
    try:
        with open(image_path, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
        return encoded_string
    except Exception as e:
        return ""
