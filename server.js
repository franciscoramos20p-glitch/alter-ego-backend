import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();

// CONFIGURACIÓN
ffmpeg.setFfmpegPath(ffmpegPath);
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

console.log(`🚀 SERVIDOR ALTER EGO PRO V5.1 (50 IDIOMAS) - PUERTO ${PORT}`);

// 🛡️ LISTA NEGRA DE ALUCINACIONES (Anti-Basura)
const HALLUCINATIONS = [
    "Subtitles by", "Amara.org", "Community", "music playing", "Unresearched",
    "Thank you", "Suscríbete", "Copyright", "Translated by", "MBC", "SBS",
    "provided by", "watching", "Please subscribe", "Me gusta", "blue skies",
    "sous-titres", "Silence", "Ruido", "Noise", "www.", ".com", "Sucedió",
    "subtítulos", "captioned", "Audio", "Transcribe", "música", "aplausos",
    "risa", "locutor", "voz en off", "test", "prueba", "1 2 3"
];

// 🌍 LOS 50 IDIOMAS SOPORTADOS POR WHISPER
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it',
    'Portugués': 'pt', 'Chino': 'zh', 'Japonés': 'ja', 'Coreano': 'ko', 'Ruso': 'ru',
    'Árabe': 'ar', 'Hindi': 'hi', 'Holandés': 'nl', 'Turco': 'tr', 'Polaco': 'pl',
    'Sueco': 'sv', 'Danés': 'da', 'Noruego': 'no', 'Finlandés': 'fi', 'Griego': 'el',
    'Checo': 'cs', 'Húngaro': 'hu', 'Rumano': 'ro', 'Tailandés': 'th', 'Vietnamita': 'vi',
    'Indonesio': 'id', 'Malayo': 'ms', 'Filipino': 'tl', 'Hebreo': 'he', 'Ucraniano': 'uk',
    'Catalán': 'ca', 'Croata': 'hr', 'Eslovaco': 'sk', 'Búlgaro': 'bg', 'Serbio': 'sr',
    'Lituano': 'lt', 'Letón': 'lv', 'Estonio': 'et', 'Esloveno': 'sl', 'Islandés': 'is',
    'Persa': 'fa', 'Urdu': 'ur', 'Bengalí': 'bn', 'Tamil': 'ta', 'Telugu': 'te',
    'Marathi': 'mr', 'Swahili': 'sw', 'Afrikáans': 'af', 'Galés': 'cy'
};

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado: ${ws._socket.remoteAddress}`);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // MODO LIVE Y CHAT (Usamos el sistema robusto Whisper+GPT-4o)
            if (['audio_input', 'text_input'].includes(data.type)) {
                await handleRequest(ws, data);
            }
            // Ping para mantener vivo el server en Render
            else if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
            }

        } catch (e) { console.error("Error General:", e.message); }
    });

    ws.on('close', () => console.log("Cliente desconectado"));
});

// PROCESADOR INTELIGENTE (Soporta M4A de Expo)
async function handleRequest(ws, data) {
    try {
        let userText = "";
        
        // 1. Transcribir Audio (Whisper)
        if (data.type === 'audio_input') {
            const inputPath = path.join(tempDir, `req_${Date.now()}.m4a`);
            fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
            
            try {
                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    language: ISO_LANGS[data.my_lang?.split(' ')[0]] || undefined,
                    prompt: "Focus on spoken words, ignore silence and background noise."
                });
                userText = transcription.text;
            } catch (err) {
                console.error("Error Whisper:", err);
                return; // Si falla la transcripción, abortamos
            } finally {
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            }
        } else {
            userText = data.text;
        }

        // 2. Filtro Anti-Basura
        const cleanText = userText.trim();
        if (cleanText.length < 2 || HALLUCINATIONS.some(h => cleanText.toLowerCase().includes(h.toLowerCase()))) {
            console.log("🗑️ Basura filtrada:", cleanText);
            return; 
        }

        console.log(`🗣️ Usuario: ${cleanText}`);

        // 3. Traducción / Interpretación (GPT-4o)
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: `Eres AlterEgo, un intérprete experto.
                  Instrucciones:
                  1. Idiomas activos: "${data.my_lang}" y "${data.target_lang_code || data.language}".
                  2. Detecta automáticamente el idioma de: "${cleanText}".
                  3. Si está en el idioma A, traduce al B. Si está en B, traduce al A.
                  4. Mantén el tono original. SOLO devuelve la traducción.` }, 
                { role: "user", content: cleanText }
            ],
            model: "gpt-4o",
            max_tokens: 200
        });
        
        const aiText = completion.choices[0].message.content;
        console.log(`🤖 IA: ${aiText}`);

        // 4. Generar Audio TTS (Voz)
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", voice: data.voice || "alloy", input: aiText, speed: 1.1 
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        // 5. Enviar respuesta
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: cleanText, 
            ai_text: aiText, 
            audio_payload: buffer.toString('base64'),
            audio: buffer.toString('base64') // Compatibilidad con LiveScreen
        }));

    } catch (e) { console.error("Error Procesando:", e); }
}