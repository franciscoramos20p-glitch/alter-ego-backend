import { WebSocketServer, WebSocket } from 'ws'; // Importamos WebSocket también para actuar como cliente
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR HÍBRIDO v5.0 (CLASSIC + LIVE): Listo en puerto ${PORT}`);

// ==========================================
// 1. CONFIGURACIÓN CLÁSICA (Directorios y Listas)
// ==========================================
const tempDir = path.resolve('temp_audio');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const BLACKLIST = ["Amara.org", "Subtitle", "Subtítulos", "MBC", "SBS", "Copyright"];

const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Japonés': 'ja', 'Coreano': 'ko',
    'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 'Portugués': 'pt', 
    'Chino': 'zh', 'Ruso': 'ru', 'Árabe': 'ar'
};

// ==========================================
// 2. ENRUTADOR DE CONEXIONES
// ==========================================
wss.on('connection', (ws, req) => {
    // Detectamos a qué URL se conectó la App
    const url = req.url || "/";
    
    if (url.includes('/live')) {
        console.log('⚡ Cliente conectado a MODO LIVE (Realtime API)');
        handleLiveConnection(ws);
    } else {
        console.log('📝 Cliente conectado a MODO CLÁSICO (v4.5)');
        handleClassicConnection(ws);
    }
});

// ==========================================
// 3. MODO LIVE (EL PROXY HACIA OPENAI) 🧠⚡
// ==========================================
function handleLiveConnection(clientWs) {
    // 1. Conectamos el servidor a OpenAI Realtime
    const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
        }
    });

    // 2. Cuando OpenAI se conecta, preparamos la sesión
    openAiWs.on('open', () => {
        console.log('✅ Conectado a OpenAI Realtime');
        // (Opcional) Aquí podrías enviar instrucciones iniciales si quisieras forzar un prompt
    });

    // 3. MENSAJES: App -> Servidor -> OpenAI
    clientWs.on('message', (data) => {
        if (openAiWs.readyState === WebSocket.OPEN) {
            openAiWs.send(data); // Reenviamos tal cual lo que manda la App
        }
    });

    // 4. MENSAJES: OpenAI -> Servidor -> App
    openAiWs.on('message', (data) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data); // Reenviamos tal cual lo que manda OpenAI
        }
    });

    // 5. Manejo de cierres y errores
    clientWs.on('close', () => openAiWs.close());
    openAiWs.on('close', () => clientWs.close());
    openAiWs.on('error', (e) => console.error("Error OpenAI WS:", e.message));
    clientWs.on('error', (e) => console.error("Error Cliente WS:", e.message));
}

// ==========================================
// 4. MODO CLÁSICO (TU CÓDIGO ACTUAL) 📜
// ==========================================
function handleClassicConnection(ws) {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const tone = data.tone || "Neutral"; 
            
            // --- MODO TEXTO ---
            if (data.type === 'text_input') {
                console.log(`📝 Texto: "${data.text}"`);
                await processGPT(ws, data.text, data.my_lang, data.language, tone, data.voice, "gpt-4o-mini");
            }

            // --- MODO AUDIO (WHISPER) ---
            if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `input_${Date.now()}.m4a`);
                fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));

                const langCode = ISO_LANGS[(data.my_lang || "").split(' ')[0]];

                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    prompt: `Conversation in ${data.my_lang} and ${data.language}.`, 
                    temperature: 0, 
                    language: langCode 
                });

                const userText = transcription.text;
                fs.unlinkSync(inputPath); 

                if (!userText || userText.trim().length < 1) return;
                if (BLACKLIST.some(bad => userText.includes(bad))) return;

                console.log(`👂 Oído: "${userText}"`);
                await processGPT(ws, userText, data.my_lang, data.language, tone, data.voice, "gpt-4o");
            }

            // --- MODO CÁMARA ---
            if (data.type === 'image_input') {
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `Traduce el texto de la imagen al ${data.my_lang}. Si no hay texto, describe qué ves. Tono: ${tone}.`}, 
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}`, detail: "auto" } }
                        ]}
                    ],
                    max_tokens: 300, 
                });
                sendResponse(ws, "📸 Imagen", response.choices[0].message.content, tone, data.voice);
            }

        } catch (error) { console.error("Error Clásico:", error.message); }
    });
}

// ==========================================
// 5. FUNCIONES AUXILIARES CLÁSICAS
// ==========================================
async function processGPT(ws, userText, myLang, targetLang, tone, voice, modelName) {
    try {
        const systemPrompt = `Eres un intérprete experto.
        Tono: ${tone}.
        Instrucciones:
        1. Traduce lo que dice el usuario.
        2. Si está en ${myLang}, traduce al ${targetLang}.
        3. Si está en ${targetLang}, traduce al ${myLang}.
        4. Solo da la traducción, no expliques nada.`;

        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userText }
            ],
            model: modelName, 
            temperature: 0.3, 
            max_tokens: 250, 
        });

        const aiText = completion.choices[0].message.content;
        if (!aiText) return;

        sendResponse(ws, userText, aiText, tone, voice);

    } catch (e) { console.error("Error GPT:", e.message); }
}

async function sendResponse(ws, userText, aiText, tone, voice = 'alloy') {
    try {
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", voice: voice, input: aiText, speed: 1.1 
        });
        const audioBuffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: userText, 
            ai_text: aiText, 
            tone: tone, 
            audio_payload: audioBuffer.toString('base64') 
        }));
    } catch (e) { console.error("Error TTS:", e.message); }
}