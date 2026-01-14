import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();

// ✅ CONFIGURACIÓN BLINDADA PARA RENDER
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V4.5 (ULTRA LIVE + CLASSIC): Listo en puerto ${PORT}`);

// Carpeta temporal para conversión de audio
const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ LISTA NEGRA ANTI-ALUCINACIONES (Modo Clásico)
const HALLUCINATIONS = [
    "Subtitles by", "Amara.org", "Community", "music playing", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "SBS", "provided by", "watching",
    "Please subscribe", "Me gusta", "blue skies", "sous-titres",
    "Silence", "Ruido", "Noise", "www.", ".com", "Sucedió",
    "subtítulos", "captioned"
];

// 🗺️ MAPA DE IDIOMAS (Modo Clásico)
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

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    let openAiWs = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // =========================================================
            // A. MODO ULTRA REALTIME (LIVE) - AISLADO
            // =========================================================
            if (data.type === 'start_realtime_session') {
                console.log("🎙️ Iniciando Modo Live...");
                
                openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                });

                const myLang = data.config.lang1 || "Español";
                const targetLang = data.config.lang2 || "Inglés";
                const tone = data.config.tone || "Neutral";

                openAiWs.on('open', () => {
                    // INSTRUCCIONES ESTRICTAS PARA NO ALUCINAR EN LIVE
                    const sessionConfig = {
                        type: "session.update",
                        session: {
                            modalities: ["text", "audio"],
                            instructions: `Actúa como un intérprete profesional. 
                            Tu tarea es traducir del ${myLang} al ${targetLang} y viceversa.
                            Tono: ${tone}.
                            REGLA IMPORTANTE: Si escuchas silencio, ruido estático, respiración o música, NO DIGAS NADA. 
                            Solo traduce voces humanas claras. Sé breve y directo.`,
                            voice: "alloy",
                            input_audio_format: "pcm16",
                            output_audio_format: "pcm16",
                            turn_detection: null // Control manual desde la App para evitar interrupciones
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));
                });

                openAiWs.on('message', (openaiMsg) => {
                    const response = JSON.parse(openaiMsg);
                    
                    // Si OpenAI manda audio (traducción)
                    if (response.type === 'response.audio.delta') {
                        // Convertir PCM Raw a WAV Header para la App
                        const pcmBuffer = Buffer.from(response.delta, 'base64');
                        const wavBuffer = toWav(pcmBuffer);
                        ws.send(JSON.stringify({ 
                            type: 'audio_payload', 
                            audio_payload: wavBuffer.toString('base64') 
                        }));
                    }
                });

                openAiWs.on('close', () => console.log("🔴 OpenAI Live Cerrado"));
                openAiWs.on('error', (e) => console.error("Error OpenAI Live:", e));
            }

            // RECIBIR AUDIO DE LA APP (CHUNK LIVE) Y CONVERTIRLO
            else if (data.type === 'audio_append' && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                // La App manda M4A, OpenAI quiere PCM16. Convertimos aquí.
                const inputBuffer = Buffer.from(data.audio, 'base64');
                convertM4AtoPCM(inputBuffer, (pcmBuffer) => {
                    openAiWs.send(JSON.stringify({
                        type: "input_audio_buffer.append",
                        audio: pcmBuffer.toString('base64')
                    }));
                    // Forzamos la respuesta inmediata
                    openAiWs.send(JSON.stringify({type: 'input_audio_buffer.commit'}));
                    openAiWs.send(JSON.stringify({type: 'response.create'}));
                });
            }

            else if (data.type === 'end_realtime_session') {
                if (openAiWs) openAiWs.close();
            }

            // =========================================================
            // B. MODO CLÁSICO (V3.9 INTACTO) - AISLADO
            // =========================================================
            else if (['audio_input', 'text_input', 'image_input'].includes(data.type)) {
                handleClassicRequest(ws, data);
            }

        } catch (e) { console.error("Error General:", e.message); }
    });
});

// 🛠️ FUNCIÓN DE CONVERSIÓN (FFMPEG)
// Convierte el audio del teléfono (M4A) a lo que pide OpenAI (PCM 24kHz)
function convertM4AtoPCM(inputBuffer, callback) {
    const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
    const tempOut = path.join(tempDir, `out_${Date.now()}_${Math.random()}.raw`);

    try {
        fs.writeFileSync(tempIn, inputBuffer);
        ffmpeg(tempIn)
            .inputFormat('m4a')
            .audioFrequency(24000)
            .audioChannels(1)
            .audioCodec('pcm_s16le')
            .format('s16le')
            .save(tempOut)
            .on('end', () => {
                if (fs.existsSync(tempOut)) {
                    const pcmData = fs.readFileSync(tempOut);
                    callback(pcmData);
                    try { fs.unlinkSync(tempIn); fs.unlinkSync(tempOut); } catch(e){}
                }
            })
            .on('error', (err) => {
                console.error("FFmpeg Error:", err);
                try { if(fs.existsSync(tempIn)) fs.unlinkSync(tempIn); } catch(e){}
            });
    } catch(e) { console.error("File Error:", e); }
}

// 🛠️ HELPER: PCM -> WAV (Para que la App lo pueda reproducir)
function toWav(pcmData) {
    const dataSize = pcmData.length;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8); buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(24000, 24);
    buffer.writeUInt32LE(48000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40); pcmData.copy(buffer, 44);
    return buffer;
}

// =========================================================
// LÓGICA CLÁSICA DETALLADA (NO TOCAR)
// =========================================================
async function handleClassicRequest(ws, data) {
    let calculatedCost = 0; 

    try {
        const tone = data.tone || "Neutral"; 
        const userLangClean = (data.my_lang || "Español").split(' ')[0]; 
        const isoCode = ISO_LANGS[userLangClean] || 'es'; 

        // --- AUDIO (Whisper) ---
        if (data.type === 'audio_input') {
            const inputPath = path.join(tempDir, `classic_${Date.now()}.m4a`);
            fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
            
            calculatedCost += 0.1; 

            const transcription = await openai.audio.transcriptions.create({ 
                file: fs.createReadStream(inputPath), 
                model: "whisper-1", 
                language: isoCode,
                prompt: "This is a conversation. Translate strictly. Do not add credits."
            });
            fs.unlinkSync(inputPath);
            
            const text = transcription.text;

            // 🛑 FILTRO ANTI-BASURA (CLÁSICO)
            const isHallucination = HALLUCINATIONS.some(h => text.toLowerCase().includes(h.toLowerCase()));
            const isTooShort = text.length < 2;

            if (isHallucination || isTooShort) {
                console.log(`🚫 Basura bloqueada en Clásico: "${text}"`);
                return; // NO ENVIAMOS NADA
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
        console.error("Error Clásico:", error.message); 
    }
}

// PROCESAMIENTO GPT (CLÁSICO)
async function processGPT(ws, text, src, tgt, tone, voice, accumulatedCost) {
    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: `Traduce del ${src} al ${tgt}. Tono: ${tone}. Solo dame la traducción.` }, 
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

// RESPUESTA FINAL (CLÁSICO)
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