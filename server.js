import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { Readable } from 'stream';

dotenv.config();

// ✅ CONFIGURACIÓN BLINDADA PARA RENDER
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR MAESTRO v4.0 (FULL 59 IDIOMAS + REALTIME): Listo en puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ FILTRO ANTI-ALUCINACIONES
const HALLUCINATIONS = [
    "Subtitles by", "Amara.org", "Community", "music playing", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "SBS", "provided by", "watching",
    "Please subscribe", "Me gusta", "blue skies", "sous-titres",
    "Silence", "Ruido", "Noise"
];

// 🗺️ MAPA EXACTO DE LOS 59 IDIOMAS DE LA APP PARA WHISPER
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 
    'Portugués': 'pt', 'Chino': 'zh', 'Japonés': 'ja', 'Coreano': 'ko', 'Ruso': 'ru', 
    'Árabe': 'ar', 'Hindi': 'hi', 'Holandés': 'nl', 'Turco': 'tr', 'Polaco': 'pl', 
    'Sueco': 'sv', 'Danés': 'da', 'Noruego': 'no', 'Finlandés': 'fi', 'Griego': 'el', 
    'Checo': 'cs', 'Húngaro': 'hu', 'Rumano': 'ro', 'Tailandés': 'th', 'Vietnamita': 'vi', 
    'Indonesio': 'id', 'Malayo': 'ms', 'Filipino': 'tl', 'Hebreo': 'he', 'Ucraniano': 'uk', 
    'Croata': 'hr', 'Eslovaco': 'sk', 'Búlgaro': 'bg', 'Serbio': 'sr', 'Catalán': 'ca', 
    'Euskera': 'eu', 'Gallego': 'gl', 'Urdu': 'ur', 'Persa': 'fa', 'Bengalí': 'bn', 
    'Tamil': 'ta', 'Telugu': 'te', 'Kannada': 'kn', 'Marathi': 'mr', 'Gujarati': 'gu', 
    'Malayalam': 'ml', 'Punjabi': 'pa', 'Swahili': 'sw', 'Afrikáans': 'af', 'Islandés': 'is', 
    'Lituano': 'lt', 'Letón': 'lv', 'Estonio': 'et', 'Esloveno': 'sl', 'Armenio': 'hy', 
    'Azerí': 'az', 'Georgiano': 'ka', 'Kazajo': 'kk', 'Nepalí': 'ne', 'Amárico': 'am', 
    'Jemer': 'km', 'Lao': 'lo'
};

// COSTOS TÉCNICOS ESTIMADOS (Base para cálculo dinámico)
const COST_PER_TOKEN_INPUT = 0.00005; 
const COST_PER_TOKEN_OUTPUT = 0.00015;
const COST_TTS_PER_CHAR = 0.0001; 

wss.on('connection', (ws, req) => {
    const url = req.url || "/";
    console.log(`⚡ Cliente conectado a: ${url}`);

    if (url.includes('/live')) {
        handleRealtimeSession(ws); // La joya de la v4.0
    } else {
        handleClassicSession(ws);  // El caballo de batalla de la v3.9
    }
});

// =========================================================
// 1. MODO LIVE (REALTIME API - LISTO PARA v4.0)
// =========================================================
function handleRealtimeSession(clientWs) {
    const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
        }
    });

    let config = { my_lang: 'Español', target_lang: 'Inglés' };

    openAiWs.on('open', () => {
        // VAD (Voice Activity Detection) DEL SERVIDOR = INTERRUPCIÓN REAL
        const sessionUpdate = {
            type: "session.update",
            session: {
                modalities: ["text", "audio"],
                instructions: `Eres un traductor profesional. 
                1. Traduce del ${config.my_lang} al ${config.target_lang} y viceversa.
                2. Si el usuario te interrumpe, CÁLLATE al instante.
                3. Si hay silencio o ruido, NO digas nada.`,
                voice: "alloy",
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                turn_detection: { type: "server_vad" } // <--- ESTO ES MAGIA
            }
        };
        openAiWs.send(JSON.stringify(sessionUpdate));
    });

    clientWs.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'config') {
                config = data;
                // Actualizamos instrucciones si la App cambia el idioma en vuelo
                if(openAiWs.readyState === WebSocket.OPEN) {
                    openAiWs.send(JSON.stringify({
                        type: "session.update",
                        session: { instructions: `Traduce del ${config.my_lang} al ${config.target_lang}.` }
                    }));
                }
            } else if (data.type === 'audio_append') {
                if (openAiWs.readyState === WebSocket.OPEN) {
                    openAiWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: data.audio }));
                }
            }
        } catch (e) {}
    });

    openAiWs.on('message', (data) => {
        try {
            const response = JSON.parse(data);

            // A. Audio (Traducción)
            if (response.type === 'response.audio.delta') {
                const pcmBuffer = Buffer.from(response.delta, 'base64');
                const wavBuffer = toWav(pcmBuffer); 
                clientWs.send(JSON.stringify({ type: 'audio_delta', payload: wavBuffer.toString('base64') }));
            }

            // B. Texto (Subtítulos Limpios)
            if (response.type === 'response.audio_transcript.done') {
                const text = response.transcript;
                if (!HALLUCINATIONS.some(h => text.toLowerCase().includes(h.toLowerCase())) && text.length > 2) {
                    clientWs.send(JSON.stringify({ type: 'text_transcript', text: text }));
                }
            }
        } catch (e) {}
    });

    const closeAll = () => {
        if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    };
    clientWs.on('close', closeAll);
    openAiWs.on('close', closeAll);
}

// =========================================================
// 2. MODO CLÁSICO (CON LOS 59 IDIOMAS MAPEAROS)
// =========================================================
function handleClassicSession(ws) {
    ws.on('message', async (message) => {
        let calculatedCost = 0; 

        try {
            const data = JSON.parse(message);
            const tone = data.tone || "Neutral"; 
            const userLangName = (data.my_lang || "Español").split(' ')[0]; // Ej: "Jemer"
            const isoCode = ISO_LANGS[userLangName] || 'es'; // Mapeo seguro a ISO

            // --- AUDIO CLÁSICO ---
            if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `classic_${Date.now()}.m4a`);
                fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
                
                calculatedCost += 0.1; // Costo base Whisper

                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    language: isoCode // <--- USAMOS EL ISO CORRECTO AQUÍ
                });
                fs.unlinkSync(inputPath);
                
                if (transcription.text && transcription.text.length > 1) {
                    calculatedCost += (transcription.text.length * 0.001); 
                    await processGPT(ws, transcription.text, data.my_lang, data.language, tone, data.voice, data.context, calculatedCost);
                }
            } 
            
            // --- TEXTO ---
            else if (data.type === 'text_input') {
                calculatedCost = 0.02;
                await processGPT(ws, data.text, data.my_lang, data.language, tone, data.voice, data.context, calculatedCost);
            }

            // --- IMAGEN ---
            else if (data.type === 'image_input') {
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `Traduce el texto de la imagen al ${data.my_lang}. Contexto: ${data.context || 'General'}.`}, 
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }
                        ]}
                    ],
                    max_tokens: 300, 
                });
                sendResponse(ws, "📸 Imagen", response.choices[0].message.content, tone, data.voice, 0); // Costo 0 (Ya cobrado fijo en App)
            }

        } catch (error) { console.error("Error Clásico:", error.message); }
    });
}

// -- PROCESAMIENTO GPT-4o --
async function processGPT(ws, text, src, tgt, tone, voice, context, accumulatedCost) {
    try {
        const systemPrompt = `Actúa como traductor experto.
        - Idioma origen: ${src}
        - Idioma destino: ${tgt}
        - Tono: ${tone}
        - Contexto del usuario: ${context || 'Ninguno'}
        - Misión: Traduce el mensaje. NO expliques nada. Solo la traducción.`;

        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt }, 
                { role: "user", content: text }
            ],
            model: "gpt-4o", 
            max_tokens: 300
        });
        
        const aiText = completion.choices[0].message.content;
        const finalCost = accumulatedCost + (aiText.length * 0.002); 

        sendResponse(ws, text, aiText, tone, voice, finalCost);
    } catch (e) { console.error(e); }
}

async function sendResponse(ws, userText, aiText, tone, voice = 'alloy', cost) {
    try {
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", voice: voice, input: aiText, speed: 1.1 
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: userText, 
            ai_text: aiText, 
            tone: tone, 
            audio_payload: buffer.toString('base64'),
            calculated_cost: cost // La App usa esto para descontar saldo
        }));
    } catch (e) { console.error("Error TTS:", e.message); }
}

function toWav(pcmData) {
    const dataSize = pcmData.length;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8); buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(24000, 24);
    buffer.writeUInt32LE(48000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40); pcmData.copy(buffer, 44);
    return buffer;
}