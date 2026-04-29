#!/usr/bin/env python3
"""
Midas — TTS para Reels de versículo

Gera narração feminina brasileira do versículo em formato MP3 via Edge TTS.
Voz: pt-BR-FranciscaNeural (calma, calorosa).

Uso:
    python midas-tts-versiculo.py "Texto do versículo" "Referência" output.mp3
"""

import asyncio
import sys
import edge_tts


async def main():
    if len(sys.argv) < 4:
        print("Uso: python midas-tts-versiculo.py 'texto' 'ref' output.mp3", file=sys.stderr)
        sys.exit(1)

    texto = sys.argv[1]
    ref = sys.argv[2]
    output = sys.argv[3]

    # Texto narrado: versículo + pausa + referência
    full_text = f"{texto} ... {ref}"

    voice = "pt-BR-FranciscaNeural"
    communicate = edge_tts.Communicate(
        full_text,
        voice,
        rate="-8%",       # ligeiramente mais lento, devocional
        pitch="-2Hz",     # tom calmo
    )
    await communicate.save(output)
    print(f"OK {output}", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
