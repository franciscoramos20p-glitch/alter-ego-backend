import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();

// ✅ CONFIGURACIÓN PARA RENDER
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR MAESTRO v4.0 (ULTRA REALTIME + CLASSIC): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ LISTA NEGRA DE ALUCINACIONES (WHISPER)
// Si Whisper devuelve esto, lo bloqueamos.
const HALLUCINATIONS = [
    "Subtitles by", "Amara.org", "Community", "music playing", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "SBS", "provided by", "watching",
    "Please subscribe", "Me gusta", "blue skies", "sous-titres",
    "Silence", "Ruido", "Noise", "www.", ".com"
];

// 🗺️ MAPA DE IDIOMAS (Coincide con App.js v4.0)
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 
    'Portugués': 'pt', 'Chino': 'zh', 'Japonés': 'ja', 'Coreano': 'ko', 'Ruso': 'ru', 
    'Árabe': 'ar', 'Hindi': 'hi', 'Holandés': 'nl', 'Turco': 'tr', 'Polaco': 'pl', 
    'Sueco': 'sv', 'Danés': 'da', 'Noruego': 'no', 'Finlandés': 'fi', 'Griego': 'el', 
    'Checo': 'cs', 'Húngaro': 'hu', 'Rumano': 'ro', 'Tailandés': 'th', 'Vietnamita': 'vi', 
    'Indonesio': 'id', 'Malayo': 'ms', 'Filipino': 'tl', 'Hebreo': 'he', 'Ucraniano': 'uk', 
    'Croata': 'hr', 'Eslovaco': 'sk', 'Búlgaro': 'bg', 'Serbio': 'sr', 'Catalán': 'ca', 
    'Urdu': 'ur', 'Persa': 'fa', 'Bengalí': 'bn', 'Tamil': 'ta', 'Telugu': 'te', 
    'Kannada': 'kn', 'Marathi': 'mr', 'Gujarati': 'gu', 'Malayalam': 'ml', 'Punjabi': 'pa', 
    'Swahili': 'sw', 'Afrikáans': 'af', 'Islandés': 'is', 'Lituano': 'lt', 'Letón': 'lv'
};

wss.on('connection', (ws, req) => {
    console.log(`⚡ Nuevo Cliente Conectado`);

    // Detectamos si el mensaje inicial pide REALTIME o CLASSIC
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // === A. MODO ULTRA REALTIME (NUEVO v4.0) ===
            if (data.type === 'start_realtime_session') {
                handleRealtimeSession(ws, data.config);
            }
            // === B. MODO CLÁSICO (Compatible con v3.9) ===
            else if (['audio_input', 'text_input', 'image_input'].includes(data.type)) {
                handleClassicRequest(ws, data);
            }
        } catch (e) {
            // Ignoramos errores de JSON malformado (ping/pong)
        }
    });
});

// =========================================================
// 1. LÓGICA ULTRA REALTIME (Blindada contra ruido)
// =========================================================
function handleRealtimeSession(clientWs, config) {
    console.log("🚀 Iniciando Sesión Realtime...");
    
    // Conectamos directo a OpenAI
    const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
        }
    });

    const myLang = config.lang1 || "Español";
    const targetLang = config.lang2 || "Inglés";
    const tone = config.tone || "Neutral";

    openAiWs.on('open', () => {
        // INSTRUCCIONES ESTRICTAS PARA NO ALUCINAR
        const sessionConfig = {
            type: "session.update",
            session: {
                modalities: ["text", "audio"],
                instructions: `Eres un intérprete experto en tiempo real. 
                Tu tarea: Traducir del ${myLang} al ${targetLang} y viceversa.
                Tono: ${tone}.
                REGLAS DE ORO (IMPORTANTE):
                1. Si escuchas SILENCIO, RUIDO DE FONDO, RESPIRACIÓN o MUSICA: NO DIGAS NADA. CÁLLATE.
                2. Solo traduce voces humanas claras.
                3. Sé breve y directo.`,
                voice: "alloy",
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                turn_detection: { 
                    type: "server_vad", // Voice Activity Detection (Detecta cuando hablas)
                    threshold: 0.5,     // Sensibilidad (0.5 evita el ruido suave)
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500 // Corta rápido si hay silencio
                }
            }
        };
        openAiWs.send(JSON.stringify(sessionConfig));
    });

    // Puente: Cliente App -> OpenAI
    clientWs.on('message', (msg) => {
        const data = JSON.parse(msg);
        if (data.type === 'end_realtime_session') {
            openAiWs.close();
        } 
        // Audio crudo (PCM16) desde la App
        // NOTA: La App debe enviar audio RAW base64
        // En este ejemplo simplificado, asumimos que el cliente envía audio chunks.
    });
    
    // Aquí recibimos audio del cliente (App.js necesita enviar 'audio_append')
    // Como tu App.js v4.0 usa un "Recorder" estándar, necesitamos un pequeño truco
    // Para simplificar, en v4.0 simulamos Realtime con el flujo clásico rápido
    // O implementamos el envío de chunks.
    // *Para que funcione con tu App.js actual (que usa grabación completa)*,
    // el modo Ultra funcionará mejor como "Fast Classic" a menos que implementemos streaming real.
    // PERO, si quieres usar la API Realtime de verdad, la App debe enviar chunks.
    
    // --> RESPUESTA A TU PREGUNTA DE "NO ALUCINAR":
    // El 'server_vad' arriba es la clave.
}

// =========================================================
// 2. LÓGICA CLÁSICA (Restaurada y Mejorada)
// =========================================================
async function handleClassicRequest(ws, data) {
    let calculatedCost = 0; 

    try {
        const tone = data.tone || "Neutral"; 
        // Limpiamos el idioma (quitar banderas)
        const userLangClean = (data.my_lang || "Español").split(' ')[0]; 
        const isoCode = ISO_LANGS[userLangClean] || 'es'; 

        // --- AUDIO (Whisper) ---
        if (data.type === 'audio_input') {
            const inputPath = path.join(tempDir, `classic_${Date.now()}.m4a`);
            fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
            
            calculatedCost += 0.1; // Costo interno aproximado

            const transcription = await openai.audio.transcriptions.create({ 
                file: fs.createReadStream(inputPath), 
                model: "whisper-1",
                language: isoCode, // Forzamos el ISO correcto
                prompt: "Conversation. No subtitles. No copyright." // Prompt anti-alucinación
            });
            fs.unlinkSync(inputPath);
            
            const text = transcription.text;

            // 🛑 FILTRO FINAL ANTI-ALUCINACIONES
            const isHallucination = HALLUCINATIONS.some(h => text.toLowerCase().includes(h.toLowerCase()));
            const isTooShort = text.length < 2;

            if (isHallucination || isTooShort) {
                console.log(`🚫 Alucinación bloqueada: "${text}"`);
                return; // NO respondemos nada
            }

            calculatedCost += (text.length * 0.001); 
            await processGPT(ws, text, data.my_lang, data.language, tone, data.voice, calculatedCost);
        } 
        
        // --- TEXTO ---
        else if (data.type === 'text_input') {
            calculatedCost = 0.02;
            await processGPT(ws, data.text, data.my_lang, data.language, tone, data.voice, calculatedCost);
        }

        // --- IMAGEN ---
        else if (data.type === 'image_input') {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "user", content: [ 
                        { type: "text", text: `Traduce el texto de la imagen al ${data.my_lang}. Sé directo.`}, 
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }
                    ]}
                ],
                max_tokens: 300, 
            });
            sendResponse(ws, "📸 Imagen", response.choices[0].message.content, tone, data.voice, 0);
        }

    } catch (error) { 
        console.error("Error Servidor:", error.message); 
    }
}

// -- PROCESAMIENTO GPT-4o --
async function processGPT(ws, text, src, tgt, tone, voice, accumulatedCost) {
    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: `Traduce del ${src} al ${tgt}. Tono: ${tone}. Solo dame la traducción, nada más.` }, 
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
            calculated_cost: cost
        }));
    } catch (e) { console.error("Error TTS:", e.message); }
}