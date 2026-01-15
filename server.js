import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();

// ✅ CONFIGURACIÓN BLINDADA
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V6.0 (PROCESADOR PURO): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ LISTA NEGRA DE ALUCINACIONES (FILTRO DE BASURA)
const HALLUCINATIONS = [
    "Subtitles by", "Amara.org", "Community", "music playing", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "SBS", "provided by", "watching",
    "Please subscribe", "Me gusta", "blue skies", "sous-titres",
    "Silence", "Ruido", "Noise", "www.", ".com", "Sucedió",
    "subtítulos", "captioned", "Audio", "Transcribe", 
    "música", "aplausos", "risa", "locutor", "voz en off"
];

// 🗺️ MAPA DE 50 IDIOMAS
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
    console.log(`⚡ Cliente Conectado`);
    let openAiWs = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // =====================================
            // A. MODO ULTRA LIVE (REALTIME API)
            // =====================================
            if (data.type === 'start_realtime_session') {
                openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                });

                const lang1 = data.config?.lang1 || "Español";
                const lang2 = data.config?.lang2 || "Inglés";

                openAiWs.on('open', () => {
                    const sessionConfig = {
                        type: "session.update",
                        session: {
                            modalities: ["text", "audio"],
                            instructions: `Eres un intérprete profesional. 
                            Idiomas: ${lang1} y ${lang2}.
                            1. Escucha atentamente.
                            2. Traduce INMEDIATAMENTE al otro idioma.
                            3. Si hay silencio o ruido de fondo, NO DIGAS NADA.
                            4. Mantén la voz natural "alloy".`,
                            voice: "alloy",
                            input_audio_format: "pcm16",
                            output_audio_format: "pcm16",
                            turn_detection: null 
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));
                });

                openAiWs.on('message', (openaiMsg) => {
                    const response = JSON.parse(openaiMsg);
                    if (response.type === 'response.audio.delta') {
                        // Enviamos el audio crudo PCM al cliente (LiveScreen lo maneja)
                        ws.send(JSON.stringify({ 
                            type: 'audio_stream', 
                            audio: response.delta 
                        }));
                    }
                });
            }

            // RECIBIR AUDIO LIVE (M4A -> PCM)
            else if (data.type === 'audio_input' && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                const inputBuffer = Buffer.from(data.payload, 'base64');
                convertM4AtoPCM(inputBuffer, (pcmBuffer) => {
                    openAiWs.send(JSON.stringify({
                        type: "input_audio_buffer.append",
                        audio: pcmBuffer.toString('base64')
                    }));
                    openAiWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
                    openAiWs.send(JSON.stringify({ type: 'response.create' }));
                });
            }

            else if (data.type === 'end_realtime_session') {
                if (openAiWs) openAiWs.close();
            }

            // =====================================
            // B. MODO CLÁSICO (CHAT)
            // =====================================
            else if (['audio_input', 'text_input', 'image_input'].includes(data.type) && !openAiWs) {
                await handleClassicRequest(ws, data);
            }

        } catch (e) { console.error("Error:", e.message); }
    });

    ws.on('close', () => { if (openAiWs) openAiWs.close(); });
});

// CONVERSOR DE AUDIO (FFMPEG)
function convertM4AtoPCM(inputBuffer, callback) {
    const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
    const tempOut = path.join(tempDir, `out_${Date.now()}_${Math.random()}.raw`);
    try {
        fs.writeFileSync(tempIn, inputBuffer);
        ffmpeg(tempIn).inputFormat('m4a')
            .audioFrequency(24000).audioChannels(1).audioCodec('pcm_s16le').format('s16le')
            .save(tempOut)
            .on('end', () => {
                if (fs.existsSync(tempOut)) {
                    callback(fs.readFileSync(tempOut));
                    try { fs.unlinkSync(tempIn); fs.unlinkSync(tempOut); } catch(e){}
                }
            })
            .on('error', () => { try { fs.unlinkSync(tempIn); } catch(e){} });
    } catch(e) {}
}

async function handleClassicRequest(ws, data) {
    try {
        let userText = "";
        
        if (data.type === 'audio_input') {
            const inputPath = path.join(tempDir, `classic_${Date.now()}.m4a`);
            fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
            const langCode = ISO_LANGS[data.my_lang?.split(' ')[0]] || undefined;
            const transcription = await openai.audio.transcriptions.create({ file: fs.createReadStream(inputPath), model: "whisper-1", language: langCode });
            fs.unlinkSync(inputPath);
            userText = transcription.text;
        } else if (data.type === 'text_input') {
            userText = data.text;
        }

        const cleanText = userText.trim();
        // Filtro de basura
        if (cleanText.length < 2 || HALLUCINATIONS.some(h => cleanText.toLowerCase().includes(h.toLowerCase()))) return;

        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: `Traduce. Idiomas: ${data.my_lang} y ${data.language}. Detecta el idioma y traduce al otro. Tono: ${data.tone || 'Neutral'}.` }, 
                { role: "user", content: cleanText }
            ],
            model: "gpt-4o", max_tokens: 300
        });
        
        const aiText = completion.choices[0].message.content;
        const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: data.voice || "alloy", input: aiText, speed: 1.1 });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ type: 'full_response', user_text: cleanText, ai_text: aiText, audio_payload: buffer.toString('base64') }));

    } catch (e) { console.error("Error Classic:", e); }
}