import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { createClient } from '@deepgram/sdk';
import stringSimilarity from 'string-similarity';

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// 🆕 INICIALIZACIÓN DE MOTORES
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";

console.log(`🛡️ SERVIDOR V115 (MODO MILITAR): Puerto ${PORT}`);

// 🎭 MAPEO DE VOCES (Frontend -> Deepgram Aura)
const VOICE_MAP = {
    "alloy": "aura-orion-en",   
    "echo": "aura-arcas-en",    
    "fable": "aura-athena-en",  
    "onyx": "aura-perseus-en",  
    "nova": "aura-asteria-en",  
    "shimmer": "aura-luna-en"   
};

// 🚫 LISTA NEGRA (Basura que la IA no debe procesar)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Translated by", "watching", 
    "Please subscribe", "sous-titres", "captioned", 
    "999", "1234", "00:00", ". . .", "..."
];

// Función auxiliar para saber si dos textos son casi iguales (El error del "Loro")
function isEcho(text1, text2) {
    return stringSimilarity.compareTwoStrings(text1.toLowerCase(), text2.toLowerCase()) > 0.85;
}

const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
wss.on('close', () => clearInterval(interval));

// ==========================================
// 🔌 CONEXIÓN WEBSOCKET
// ==========================================
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.lastMessageTime = 0; 
    ws.lastAiResponse = ""; 

    console.log(`⚡ Cliente Conectado: ${req.socket.remoteAddress}`);
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            const now = Date.now();
            if (now - ws.lastMessageTime < 50) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) ws.close();
                else ws.send(JSON.stringify({ type: 'auth_success' })); 
                return;
            }

            // 🎙️ PROCESAMIENTO DE AUDIO (Lógica Nueva)
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                
                // 1. LEEMOS LOS IDIOMAS QUE EL USUARIO TIENE EN PANTALLA
                // Ejemplo: langA = "Spanish", langB = "Japanese"
                const langA = data.langSource || "Spanish";
                const langB = data.langTarget || "English";
                const isFastMode = data.fastMode === true;
                const targetVoiceModel = VOICE_MAP[data.voice || "nova"] || "aura-asteria-en";

                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 2. DEEPGRAM OÍDO: Detecta qué idioma se habló REALMENTE
                    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                        audioBuffer,
                        { model: "nova-2", smart_format: true, detect_language: true, punctuate: true }
                    );

                    if (error) throw new Error("STT Error");
                    
                    let userText = result.results.channels[0].alternatives[0].transcript.trim();
                    let detectedCode = result.results.channels[0].alternatives[0].detected_language; // ej: 'es', 'ja', 'en'

                    // Filtros básicos
                    if (userText.length < 2) return;
                    if (HALLUCINATION_TRIGGERS.some(t => userText.includes(t))) return;

                    console.log(`🗣️ Entrada: "${userText}" (Detectado: ${detectedCode})`);

                    // 3. CÁLCULO DEL OBJETIVO (AQUÍ ESTÁ LA MAGIA)
                    // No dejamos que la IA decida. Nosotros decidimos el "Target Language" aquí en código.
                    
                    let targetLanguageName = langB; // Por defecto traducimos al idioma B
                    
                    // Si Deepgram dice que el audio es 'es' (Español) y el Idioma B es 'Japanese', target = Japanese.
                    // Si Deepgram dice que el audio es 'ja' (Japones), entonces target = Spanish.
                    
                    // Lógica simple: Si el idioma detectado NO se parece al idioma A, asumimos que hablaron en B, entonces traducimos a A.
                    // (Simplificado para robustez: Forzamos la traducción al idioma "Opuesto")
                    
                    const systemPrompt = `
                    TASK: TRANSLATE the following text.
                    
                    INPUT TEXT: "${userText}"
                    
                    CONTEXT:
                    - User has Language 1: ${langA}
                    - User has Language 2: ${langB}
                    - Audio Detected as: ${detectedCode}
                    
                    LOGIC:
                    - If input seems to be ${langA}, translate to ${langB}.
                    - If input seems to be ${langB}, translate to ${langA}.
                    
                    CRITICAL RULES:
                    1. OUTPUT ONLY THE TRANSLATED TEXT. NOTHING ELSE.
                    2. DO NOT ANSWER THE USER. If user says "Hello", output "Hola" (or target lang), DO NOT say "Hi how are you".
                    3. DO NOT REPEAT THE INPUT. (If input is "Hola", output MUST NOT be "Hola").
                    4. IF YOU CANNOT TRANSLATE, OUTPUT "SILENCE".
                    `;

                    // 4. CEREBRO (GROQ) - Temperatura 0 para ser una máquina fría
                    const completion = await groq.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt } // Solo System Prompt, sin historial de chat
                        ],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.0, 
                        max_tokens: 200
                    });
                    
                    let aiText = completion.choices[0].message.content.trim();
                    
                    // Limpieza agresiva
                    aiText = aiText.replace(/"/g, '').replace(/Translation:/gi, '').trim();

                    // 🛑 ANTI-LORO FINAL (Si traduce lo mismo que entró, lo matamos)
                    if (isEcho(userText, aiText)) {
                        console.log("⚠️ Ecos detectado (IA repitió el texto). Bloqueando.");
                        return;
                    }
                    
                    if (!aiText || aiText === "SILENCE") return;

                    console.log(`✅ Traducción: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 5. GENERAR AUDIO (Solo si no es modo Flash)
                    let audioB64 = null;
                    if (!isFastMode) {
                        const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoiceModel}`, {
                            method: 'POST',
                            headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: aiText })
                        });
                        if (response.ok) {
                            const arrayBuffer = await response.arrayBuffer();
                            audioB64 = Buffer.from(arrayBuffer).toString('base64');
                        }
                    }

                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));

                } catch (error) { console.error("❌ Error:", error.message); }
            }
        } catch (e) { console.error("WS Error:", e.message); }
    });
});