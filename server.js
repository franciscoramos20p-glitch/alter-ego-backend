import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();

// ✅ CONFIGURACIÓN FFMPEG (Solo para modo Clásico si fuera necesario)
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V7.0 (MASTER): Puerto ${PORT} - LISTO`);

// Directorio temporal solo para modo Clásico (Chat normal)
const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ LISTA NEGRA DE ALUCINACIONES
const HALLUCINATIONS = [
    "Subtitles by", "Amara.org", "Community", "music playing", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "SBS", "provided by", "watching",
    "Please subscribe", "Me gusta", "blue skies", "sous-titres",
    "Silence", "Ruido", "Noise", "www.", ".com", "Sucedió",
    "subtítulos", "captioned", "Audio", "Transcribe", 
    "música", "aplausos", "risa", "locutor", "voz en off"
];

// 🗺️ MAPA DE 50 IDIOMAS (Código ISO 639-1)
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

            // ===============================================
            // A. MODO ULTRA LIVE (REALTIME API - SIN RETRASO)
            // ===============================================
            if (data.type === 'start_realtime_session') {
                console.log("🎙️ Iniciando Sesión Realtime...");
                
                // Conexión Directa a OpenAI (Backend actúa como puente)
                openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                });

                const lang1 = data.config?.lang1 || "es"; // Ahora recibimos códigos 'es', 'en'
                const lang2 = data.config?.lang2 || "en";

                openAiWs.on('open', () => {
                    console.log("✅ Conectado a OpenAI Realtime");
                    
                    // Instrucciones Críticas para el Traductor
                    const sessionConfig = {
                        type: "session.update",
                        session: {
                            modalities: ["text", "audio"],
                            instructions: `Actúa como un intérprete experto en tiempo real. 
                            Idiomas activos: ${lang1} y ${lang2}.
                            1. Escucha audio en cualquiera de los dos idiomas.
                            2. Traduce INMEDIATAMENTE al otro idioma.
                            3. Sé conciso y directo.
                            4. Ignora ruido de fondo o silencios.
                            5. NO expliques nada, solo traduce.`,
                            voice: "alloy",
                            input_audio_format: "pcm16", // Formato crudo
                            output_audio_format: "pcm16",
                            turn_detection: {
                                type: "server_vad", // Detección de voz automática del servidor
                                threshold: 0.5,
                                prefix_padding_ms: 300,
                                silence_duration_ms: 500 // Respuesta rápida tras silencio
                            }
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));
                });

                openAiWs.on('message', (openaiMsg) => {
                    const response = JSON.parse(openaiMsg);
                    
                    // 1. OpenAI empieza a hablar (VAD activado por IA)
                    if (response.type === 'response.audio.delta' && response.delta) {
                        // Reenviamos el audio INMEDIATAMENTE al cliente
                        ws.send(JSON.stringify({ 
                            type: 'audio_stream', 
                            audio: response.delta 
                        }));
                    }
                    
                    // 2. OpenAI detectó que el usuario empezó a hablar (Interrupción)
                    if (response.type === 'input_audio_buffer.speech_started') {
                        ws.send(JSON.stringify({ type: 'vad_start' })); // Avisamos al cliente
                        openAiWs.send(JSON.stringify({ type: 'response.cancel' })); // Cancelamos si la IA hablaba
                    }
                });
                
                openAiWs.on('error', (e) => console.error("Error OpenAI WS:", e.message));
            }

            // RECIBIR AUDIO DEL CLIENTE (STREAMING RAW)
            else if (data.type === 'audio_input' && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
    // 1. Guardar el chunk temporalmente
    const inputBuffer = Buffer.from(data.payload, 'base64');
    const tempIn = path.join(tempDir, `live_in_${Date.now()}_${Math.random()}.m4a`);
    const tempOut = path.join(tempDir, `live_out_${Date.now()}_${Math.random()}.raw`); // RAW PCM

    try {
        fs.writeFileSync(tempIn, inputBuffer);
        
        // 2. Convertir M4A -> PCM16 24k (Lo que pide OpenAI)
        ffmpeg(tempIn)
            .inputFormat('m4a') // O el formato que envíe tu app
            .audioFrequency(24000)
            .audioChannels(1)
            .audioCodec('pcm_s16le')
            .format('s16le') // PCM Crudo sin headers
            .save(tempOut)
            .on('end', () => {
                if (fs.existsSync(tempOut)) {
                    const pcmData = fs.readFileSync(tempOut);
                    // 3. Enviar a OpenAI
                    openAiWs.send(JSON.stringify({
                        type: "input_audio_buffer.append",
                        audio: pcmData.toString('base64')
                    }));
                    // Limpieza
                    try { fs.unlinkSync(tempIn); fs.unlinkSync(tempOut); } catch(e){}
                }
            })
            .on('error', (err) => {
                console.error("Error FFMPEG Live:", err);
                try { fs.unlinkSync(tempIn); } catch(e){}
            });
    } catch(e) { console.error("Error File System:", e); }
}

            else if (data.type === 'end_realtime_session') {
                if (openAiWs) openAiWs.close();
                console.log("🛑 Sesión Realtime Terminada");
            }

            // =====================================
            // B. MODO CLÁSICO (CHAT / ARCHIVOS)
            // =====================================
            else if (['audio_input', 'text_input'].includes(data.type) && !openAiWs) {
                await handleClassicRequest(ws, data);
            }

        } catch (e) { console.error("Error General:", e.message); }
    });

    ws.on('close', () => { if (openAiWs) openAiWs.close(); });
});

// --- MANEJADOR MODO CLÁSICO (CHAT) ---
async function handleClassicRequest(ws, data) {
    try {
        let userText = "";
        
        // 1. Proceso de Audio (Whisper)
        if (data.type === 'audio_input') {
            const inputPath = path.join(tempDir, `classic_${Date.now()}.m4a`);
            fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
            
            // Usamos Whisper Clásico
            const langCode = data.my_lang ? (ISO_LANGS[data.my_lang.split(' ')[0]] || undefined) : undefined;
            const transcription = await openai.audio.transcriptions.create({ 
                file: fs.createReadStream(inputPath), 
                model: "whisper-1", 
                language: langCode 
            });
            
            // Limpieza
            try { fs.unlinkSync(inputPath); } catch(e){}
            userText = transcription.text;
        } 
        // 2. Proceso de Texto
        else if (data.type === 'text_input') {
            userText = data.text;
        }

        const cleanText = userText ? userText.trim() : "";
        
        // Filtro Anti-Basura
        if (cleanText.length < 2 || HALLUCINATIONS.some(h => cleanText.toLowerCase().includes(h.toLowerCase()))) {
            return; // Ignoramos si es basura
        }

        // 3. Traducción GPT-4o
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: `Eres Traductor Pro. Idiomas: ${data.my_lang} <-> ${data.language}. Detecta y traduce al contrario.` }, 
                { role: "user", content: cleanText }
            ],
            model: "gpt-4o", 
            max_tokens: 300
        });
        
        const aiText = completion.choices[0].message.content;

        // 4. Generación de Audio (TTS)
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", 
            voice: data.voice || "alloy", 
            input: aiText, 
            speed: 1.1 
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: cleanText, 
            ai_text: aiText, 
            audio_payload: buffer.toString('base64') 
        }));

    } catch (e) { console.error("Error Classic:", e); }
}