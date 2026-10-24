"""Puts the same region of two screenshots side by side (Figma left, app right, a red bar between).

    python3 compare_crops.py figma.png app.png x0,y0,x1,y1 out.png [scale]

Take both at the frame's size (the Figma frames are 1512 wide; screenshot the app at a 1512 × 982 or
1512 × 2029 viewport) so the same coordinates crop the same place. `scale` enlarges the result
(nearest neighbour, so pixels stay sharp); default 2.
"""

import sys

from PIL import Image

figma, app, box, out = sys.argv[1:5]
scale = float(sys.argv[5]) if len(sys.argv) > 5 else 2
x0, y0, x1, y1 = map(int, box.split(","))
left = Image.open(figma).convert("RGB").crop((x0, y0, x1, y1))
right = Image.open(app).convert("RGB").crop((x0, y0, x1, y1))
sheet = Image.new("RGB", (left.width * 2 + 10, left.height), "red")
sheet.paste(left, (0, 0))
sheet.paste(right, (left.width + 10, 0))
sheet = sheet.resize((int(sheet.width * scale), int(sheet.height * scale)), Image.NEAREST)
sheet.save(out)
print(out)
