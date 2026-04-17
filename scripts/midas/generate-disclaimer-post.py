"""
Gera post fixo com disclaimer educativo para @pros.peridadedoreino
Formato 1080x1350 (Instagram retrato — melhor uso de tela)
"""
import os
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'midas', 'disclaimer-post.png')
W, H = 1080, 1350

# Cores brand
NAVY_DEEP = (12, 20, 40)
NAVY_MID = (24, 35, 62)
GOLD = (212, 175, 55)
GOLD_LIGHT = (240, 217, 127)
WHITE = (250, 248, 240)
MUTED = (180, 180, 190)

def get_font(size, bold=False):
    candidates = [
        'C:/Windows/Fonts/seguisb.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf',
        'C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf',
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

def gradient_bg(img, top_color, bottom_color):
    draw = ImageDraw.Draw(img)
    for y in range(H):
        ratio = y / H
        r = int(top_color[0] + (bottom_color[0] - top_color[0]) * ratio)
        g = int(top_color[1] + (bottom_color[1] - top_color[1]) * ratio)
        b = int(top_color[2] + (bottom_color[2] - top_color[2]) * ratio)
        draw.line([(0, y), (W, y)], fill=(r, g, b))
    return img

def draw_gold_accent(draw, x, y, width=120, height=6):
    draw.rectangle([x, y, x + width, y + height], fill=GOLD)

def draw_wrapped_text(draw, text, pos, font, color, max_width, line_spacing=12):
    x, y = pos
    words = text.split(' ')
    lines = []
    current = []
    for word in words:
        test = ' '.join(current + [word])
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current.append(word)
        else:
            if current:
                lines.append(' '.join(current))
            current = [word]
    if current:
        lines.append(' '.join(current))

    for line in lines:
        draw.text((x, y), line, font=font, fill=color)
        bbox = draw.textbbox((0, 0), line, font=font)
        y += (bbox[3] - bbox[1]) + line_spacing
    return y

# Cria imagem com gradiente
img = Image.new('RGB', (W, H), NAVY_DEEP)
img = gradient_bg(img, NAVY_DEEP, NAVY_MID)
draw = ImageDraw.Draw(img)

# Elementos decorativos — círculos dourados sutis no fundo
overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
odraw = ImageDraw.Draw(overlay)
odraw.ellipse([-200, -200, 300, 300], fill=(*GOLD, 25))
odraw.ellipse([W - 300, H - 300, W + 200, H + 200], fill=(*GOLD, 30))
overlay = overlay.filter(ImageFilter.GaussianBlur(radius=80))
img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
draw = ImageDraw.Draw(img)

# Header — traço dourado + tag
draw_gold_accent(draw, 100, 140)
draw.text((100, 160), 'AVISO LEGAL', font=get_font(28, bold=True), fill=GOLD)

# Título principal
title_font = get_font(76, bold=True)
draw.text((100, 220), 'Conteúdo', font=title_font, fill=WHITE)
draw.text((100, 310), 'educativo', font=title_font, fill=GOLD_LIGHT)

# Subtítulo explicativo
sub_font = get_font(30)
sub_y = draw_wrapped_text(
    draw,
    'Este perfil compartilha informações sobre o mercado de criptomoedas com foco em aprendizado.',
    (100, 430), sub_font, MUTED, max_width=880, line_spacing=10
)

# Bullet points de disclaimer (sem emoji — geometria clean)
bullet_y = sub_y + 50
bullets = [
    'Não é recomendação de investimento',
    'Decisões financeiras são pessoais',
    'Consulte profissional qualificado',
    'Mercado cripto tem riscos reais',
]
bullet_font = get_font(30, bold=False)

for text in bullets:
    # Bullet dourado sólido
    draw.rectangle([110, bullet_y + 12, 130, bullet_y + 32], fill=GOLD)
    # Texto
    draw.text((160, bullet_y + 6), text, font=bullet_font, fill=WHITE)
    bullet_y += 85

# Footer — handle da conta
footer_y = H - 180
draw_gold_accent(draw, 100, footer_y - 30)
draw.text((100, footer_y), '@pros.peridadedoreino', font=get_font(32, bold=True), fill=GOLD_LIGHT)
draw.text((100, footer_y + 50), 'Link na bio → método completo', font=get_font(26), fill=MUTED)

img.save(OUT, 'PNG', optimize=True, quality=95)
print(f'✅ Salvo em {OUT}')
print(f'   Dimensões: {W}x{H}')

size_kb = os.path.getsize(OUT) // 1024
print(f'   Tamanho: {size_kb} KB')
