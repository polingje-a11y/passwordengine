from PIL import Image

input_path = r"C:\Users\JeremyPoling\.gemini\antigravity-ide\brain\a1451a48-ef18-4d4d-9bea-397959ceb5c5\password_engine_icon_1781558603698.png"

img = Image.open(input_path)

# Resize to 192x192
img_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
img_192.save("icon-192.png", "PNG")

# Resize to 512x512
img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
img_512.save("icon-512.png", "PNG")

print("Successfully resized and saved PWA icons!")
