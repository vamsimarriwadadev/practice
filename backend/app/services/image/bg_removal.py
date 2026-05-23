from io import BytesIO

from PIL import Image
from rembg import remove, new_session


class BackgroundRemovalService:

    def __init__(self):

        self.session = new_session("silueta")

    async def remove_background(
        self,
        image_bytes: bytes
    ) -> bytes:

        input_image = Image.open(
            BytesIO(image_bytes)
        )

        output_image = remove(
            input_image,
            session=self.session
        )

        output_buffer = BytesIO()

        output_image.save(
            output_buffer,
            format="PNG"
        )

        return output_buffer.getvalue()