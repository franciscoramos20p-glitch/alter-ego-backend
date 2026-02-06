import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import Groq from 'groq-sdk'; 
import { createClient } from '@deepgram/sdk';

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// 🆕 INICIALIZACIÓN DE MOTORES
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// 🔑 CONFIGURACIÓN DE SEGURIDAD
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";
const FIREBASE_DB_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com'; 

console.log(`🏆 SERVIDOR SUPREMO V12.0 (DIRECT COMMAND): Puerto: ${PORT}`);

// 🎭 MAPEO DE VOCES
const VOICE_MAP = {
    "alloy": "aura-orion-en",   
    "echo": "aura-arcas-en",    
    "fable": "aura-athena-en",  
    "onyx": "aura-perseus-en",  
    "nova": "aura-asteria-en",  
    "shimmer": "aura-luna-en"   
};

// =================================================================
// 🌍 LISTA MAESTRA DE IDIOMAS (TU APP)
// =================================================================
const LANGUAGES = [
    { code: 'es', name: 'Español', flag: '🇪🇸', serverName: 'Spanish' },
    { code: 'en', name: 'Inglés', flag: '🇺🇸', serverName: 'English' },
    { code: 'fr', name: 'Francés', flag: '🇫🇷', serverName: 'French' },
    { code: 'de', name: 'Alemán', flag: '🇩🇪', serverName: 'German' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹', serverName: 'Italian' },
    { code: 'pt-BR', name: 'Portugués (BR)', flag: '🇧🇷', serverName: 'Portuguese (Brazil)' },
    { code: 'zh-CN', name: 'Chino (Simpl)', flag: '🇨🇳', serverName: 'Chinese (Simplified)' },
    { code: 'ja', name: 'Japonés', flag: '🇯🇵', serverName: 'Japanese' },
    { code: 'ko', name: 'Coreano', flag: '🇰🇷', serverName: 'Korean' },
    { code: 'ru', name: 'Ruso', flag: '🇷🇺', serverName: 'Russian' },
    { code: 'ar', name: 'Árabe', flag: '🇸🇦', serverName: 'Arabic' },
    { code: 'hi', name: 'Hindi', flag: '🇮🇳', serverName: 'Hindi' },
    { code: 'pt-PT', name: 'Portugués (EU)', flag: '🇵🇹', serverName: 'Portuguese (Portugal)' },
    { code: 'nl', name: 'Holandés', flag: '🇳🇱', serverName: 'Dutch' },
    { code: 'tr', name: 'Turco', flag: '🇹🇷', serverName: 'Turkish' },
    { code: 'pl', name: 'Polaco', flag: '🇵🇱', serverName: 'Polish' },
    { code: 'sv', name: 'Sueco', flag: '🇸🇪', serverName: 'Swedish' },
    { code: 'uk', name: 'Ucraniano', flag: '🇺🇦', serverName: 'Ukrainian' },
    { code: 'da', name: 'Danés', flag: '🇩🇰', serverName: 'Danish' },
    { code: 'no', name: 'Noruego', flag: '🇳🇴', serverName: 'Norwegian' },
    { code: 'fi', name: 'Finlandés', flag: '🇫🇮', serverName: 'Finnish' },
    { code: 'el', name: 'Griego', flag: '🇬🇷', serverName: 'Greek' },
    { code: 'cs', name: 'Checo', flag: '🇨🇿', serverName: 'Czech' },
    { code: 'hu', name: 'Húngaro', flag: '🇭🇺', serverName: 'Hungarian' },
    { code: 'ro', name: 'Rumano', flag: '🇷🇴', serverName: 'Romanian' },
    { code: 'ca', name: 'Catalán', flag: '🏴', serverName: 'Catalan' },
    { code: 'eu', name: 'Euskera', flag: '🏴', serverName: 'Basque' },
    { code: 'gl', name: 'Gallego', flag: '🏴', serverName: 'Galician' },
    { code: 'hr', name: 'Croata', flag: '🇭🇷', serverName: 'Croatian' },
    { code: 'sr', name: 'Serbio', flag: '🇷🇸', serverName: 'Serbian' },
    { code: 'sk', name: 'Eslovaco', flag: '🇸🇰', serverName: 'Slovak' },
    { code: 'sl', name: 'Esloveno', flag: '🇸🇮', serverName: 'Slovenian' },
    { code: 'bg', name: 'Búlgaro', flag: '🇧🇬', serverName: 'Bulgarian' },
    { code: 'et', name: 'Estonio', flag: '🇪🇪', serverName: 'Estonian' },
    { code: 'lv', name: 'Letón', flag: '🇱🇻', serverName: 'Latvian' },
    { code: 'lt', name: 'Lituano', flag: '🇱🇹', serverName: 'Lithuanian' },
    { code: 'is', name: 'Islandés', flag: '🇮🇸', serverName: 'Icelandic' },
    { code: 'ga', name: 'Irlandés', flag: '🇮🇪', serverName: 'Irish' },
    { code: 'cy', name: 'Galés', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', serverName: 'Welsh' },
    { code: 'mt', name: 'Maltés', flag: '🇲🇹', serverName: 'Maltese' },
    { code: 'sq', name: 'Albanés', flag: '🇦🇱', serverName: 'Albanian' },
    { code: 'mk', name: 'Macedonio', flag: '🇲🇰', serverName: 'Macedonian' },
    { code: 'bs', name: 'Bosnio', flag: '🇧🇦', serverName: 'Bosnian' },
    { code: 'be', name: 'Bielorruso', flag: '🇧🇾', serverName: 'Belarusian' },
    { code: 'lb', name: 'Luxemburgués', flag: '🇱🇺', serverName: 'Luxembourgish' },
    { code: 'zh-TW', name: 'Chino (Trad)', flag: '🇹🇼', serverName: 'Chinese (Traditional)' },
    { code: 'th', name: 'Tailandés', flag: '🇹🇭', serverName: 'Thai' },
    { code: 'vi', name: 'Vietnamita', flag: '🇻🇳', serverName: 'Vietnamese' },
    { code: 'id', name: 'Indonesio', flag: '🇮🇩', serverName: 'Indonesian' },
    { code: 'ms', name: 'Malayo', flag: '🇲🇾', serverName: 'Malay' },
    { code: 'tl', name: 'Filipino', flag: '🇵🇭', serverName: 'Tagalog' },
    { code: 'my', name: 'Birmano', flag: '🇲🇲', serverName: 'Burmese' },
    { code: 'km', name: 'Jemer', flag: '🇰🇭', serverName: 'Khmer' },
    { code: 'lo', name: 'Laosiano', flag: '🇱🇦', serverName: 'Lao' },
    { code: 'ne', name: 'Nepalí', flag: '🇳🇵', serverName: 'Nepali' },
    { code: 'si', name: 'Cingalés', flag: '🇱🇰', serverName: 'Sinhala' },
    { code: 'mn', name: 'Mongol', flag: '🇲🇳', serverName: 'Mongolian' },
    { code: 'kk', name: 'Kazajo', flag: '🇰🇿', serverName: 'Kazakh' },
    { code: 'uz', name: 'Uzbeko', flag: '🇺🇿', serverName: 'Uzbek' },
    { code: 'ky', name: 'Kirguís', flag: '🇰🇬', serverName: 'Kyrgyz' },
    { code: 'tg', name: 'Tayiko', flag: '🇹🇯', serverName: 'Tajik' },
    { code: 'he', name: 'Hebreo', flag: '🇮🇱', serverName: 'Hebrew' },
    { code: 'fa', name: 'Persa (Farsi)', flag: '🇮🇷', serverName: 'Persian' },
    { code: 'ps', name: 'Pastún', flag: '🇦🇫', serverName: 'Pashto' },
    { code: 'ku', name: 'Kurdo', flag: '🇹🇯', serverName: 'Kurdish' },
    { code: 'hy', name: 'Armenio', flag: '🇦🇲', serverName: 'Armenian' },
    { code: 'az', name: 'Azerí', flag: '🇦🇿', serverName: 'Azerbaijani' },
    { code: 'ka', name: 'Georgiano', flag: '🇬🇪', serverName: 'Georgian' },
    { code: 'bn', name: 'Bengalí', flag: '🇧🇩', serverName: 'Bengali' },
    { code: 'pa', name: 'Punyabí', flag: '🇮🇳', serverName: 'Punjabi' },
    { code: 'ta', name: 'Tamil', flag: '🇱🇰', serverName: 'Tamil' },
    { code: 'te', name: 'Telugu', flag: '🇮🇳', serverName: 'Telugu' },
    { code: 'mr', name: 'Maratí', flag: '🇮🇳', serverName: 'Marathi' },
    { code: 'ur', name: 'Urdu', flag: '🇵🇰', serverName: 'Urdu' },
    { code: 'gu', name: 'Guyaratí', flag: '🇮🇳', serverName: 'Gujarati' },
    { code: 'kn', name: 'Canarés', flag: '🇮🇳', serverName: 'Kannada' },
    { code: 'ml', name: 'Malayalam', flag: '🇮🇳', serverName: 'Malayalam' },
    { code: 'sw', name: 'Suajili', flag: '🇰🇪', serverName: 'Swahili' },
    { code: 'am', name: 'Amárico', flag: '🇪🇹', serverName: 'Amharic' },
    { code: 'so', name: 'Somalí', flag: '🇸🇴', serverName: 'Somali' },
    { code: 'zu', name: 'Zulú', flag: '🇿🇦', serverName: 'Zulu' },
    { code: 'xh', name: 'Xhosa', flag: '🇿🇦', serverName: 'Xhosa' },
    { code: 'af', name: 'Afrikáans', flag: '🇿🇦', serverName: 'Afrikaans' },
    { code: 'yo', name: 'Yoruba', flag: '🇳🇬', serverName: 'Yoruba' },
    { code: 'ig', name: 'Igbo', flag: '🇳🇬', serverName: 'Igbo' },
    { code: 'ha', name: 'Hausa', flag: '🇳🇬', serverName: 'Hausa' },
    { code: 'ht', name: 'Criollo Haitiano', flag: '🇭🇹', serverName: 'Haitian Creole' },
    { code: 'gn', name: 'Guaraní', flag: '🇵🇾', serverName: 'Guarani' },
    { code: 'qu', name: 'Quechua', flag: '🇵🇪', serverName: 'Quechua' },
    { code: 'eo', name: 'Esperanto', flag: '🌍', serverName: 'Esperanto' },
    { code: 'la', name: 'Latín', flag: '🏛️', serverName: 'Latin' },
    { code: 'mg', name: 'Malgache', flag: '🇲🇬', serverName: 'Malagasy' },
    { code: 'mi', name: 'Maorí', flag: '🇳🇿', serverName: 'Maori' },
    { code: 'sm', name: 'Samoano', flag: '🇼🇸', serverName: 'Samoan' },
    { code: 'haw', name: 'Hawaiano', flag: '🌺', serverName: 'Hawaiian' },
    { code: 'jw', name: 'Javanés', flag: '🇮🇩', serverName: 'Javanese' },
    { code: 'su', name: 'Sundanés', flag: '🇮🇩', serverName: 'Sundanese' },
    { code: 'yi', name: 'Yidis', flag: '✡️', serverName: 'Yiddish' }
];

// Función para obtener el código ISO exacto
function getLangCode(serverName) {
    if (!serverName) return 'en';
    const found = LANGUAGES.find(l => l.serverName.toLowerCase() === serverName.toLowerCase());
    return found ? found.code : 'en';
}

// Limpieza básica
function sanitizeAiResponse(text) {
    if (!text) return "";
    return text
        .replace(/\*\*/g, "") 
        .replace(/Translation:/gi, "")
        .replace(/^["']|["']$/g, "") 
        .trim();
}

// 💓 HEARTBEAT
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

    console.log(`⚡ Cliente Conectado: ${req.socket.remoteAddress}`);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            const now = Date.now();
            if (now - ws.lastMessageTime < 20) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'start_realtime_session' || data.type === 'ping') return;
            
            // 🔐 AUTH
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    ws.close();
                    return;
                }
                let realCredits = 0;
                if (data.user_id) {
                    try {
                        const response = await fetch(`${FIREBASE_DB_URL}/users/${data.user_id}.json`);
                        const userData = await response.json();
                        if (userData && userData.credits !== undefined) realCredits = parseFloat(userData.credits);
                    } catch (err) {}
                }
                console.log(`✅ Auth OK. Usuario: ${data.user_id || 'Anon'}. Créditos: ${realCredits}`);
                ws.send(JSON.stringify({ type: 'auth_success', credits: realCredits })); 
                return;
            }

            const requestedVoice = data.voice || "alloy";
            const targetVoice = VOICE_MAP[requestedVoice] || "aura-asteria-en"; 
            
            const langNameA = data.langSource || "Spanish"; 
            const langNameB = data.langTarget || "English"; 
            
            // 🔍 BÚSQUEDA EXACTA EN TU LISTA
            const codeA = getLangCode(langNameA);
            const codeB = getLangCode(langNameB);

            const isFastMode = data.fastMode === true;

            // =================================================================
            // 🎙️ MODO AUDIO
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. DEEPGRAM NOVA-2 (OÍDO)
                    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                        audioBuffer,
                        {
                            model: "nova-2",
                            smart_format: true,
                            detect_language: [codeA, codeB], 
                            punctuate: true,
                            utterances: true
                        }
                    );

                    if (error) throw new Error("Deepgram STT Error");
                    
                    let userText = "";
                    let detectedLang = "unknown";

                    if (result.results && result.results.channels[0].alternatives[0]) {
                        userText = result.results.channels[0].alternatives[0].transcript.trim();
                        detectedLang = result.results.channels[0].alternatives[0].detected_language;
                    }

                    if (!userText || userText.length === 0) return;

                    console.log(`🗣️ [Escuchado (${detectedLang})]: "${userText}"`);

                    // =================================================================
                    // 🔥🔥 LÓGICA DE CRUCE FORZADO 🔥🔥
                    // =================================================================
                    // Aquí determinamos MATEMÁTICAMENTE a qué idioma traducir.
                    // No dejamos que la IA adivine.
                    
                    let targetLangName = langNameB; // Por defecto al B
                    
                    // Si Deepgram dice que hablaste en B, traducimos a A.
                    if (detectedLang === codeB) {
                        targetLangName = langNameA;
                    } 
                    // Si Deepgram dice que hablaste en A, traducimos a B (ya está por defecto).
                    
                    // =================================================================
                    // 🔥🔥 ZONA DE PROMPT "DIRECT COMMAND" 🔥🔥
                    // =================================================================
                    // Instrucción simple y directa. Sin roles complejos.
                    
                    const systemPrompt = `
                        You are a professional translator.
                        Translate the following text to ${targetLangName}.
                        Do not explain. Do not correct grammar. Just translate.
                    `;

                    // 2. GROQ (LLAMA 3) - CEREBRO
                    const completion = await groq.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userText }
                        ],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.1, // Baja temperatura para precisión
                        max_tokens: 256
                    });
                    
                    let aiText = completion.choices[0].message.content;
                    aiText = sanitizeAiResponse(aiText);

                    if (!aiText || aiText.length < 1) return;

                    console.log(`🧠 [Traducción -> ${targetLangName}]: "${aiText}"`);

                    // 3. DEEPGRAM AURA (VOZ)
                    let audioB64 = null;

                    if (isFastMode) {
                        console.log("⚡ Modo Flash: Solo texto.");
                    } else {
                        const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoice}`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ text: aiText })
                        });

                        if (!response.ok) throw new Error("Deepgram TTS Error");
                        const arrayBuffer = await response.arrayBuffer();
                        audioB64 = Buffer.from(arrayBuffer).toString('base64');
                    }
                    
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));

                } catch (error) { console.error("❌ Error:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO (LÓGICA DE CRUCE TAMBIÉN AQUÍ)
            // =================================================================
            else if (data.type === 'text_input') {
                try {
                    // En texto no sabemos el idioma de entrada automáticamente (Deepgram no corre).
                    // Así que usamos un prompt ligeramente diferente para que detecte y cruce.
                    const textPrompt = `
                        Translate the input text to the OTHER language.
                        Options: ${langNameA} or ${langNameB}.
                        
                        If input is ${langNameA} -> Translate to ${langNameB}.
                        If input is ${langNameB} -> Translate to ${langNameA}.
                        
                        Output ONLY the translation.
                    `;

                    const completion = await groq.chat.completions.create({
                        messages: [
                            { role: "system", content: textPrompt },
                            { role: "user", content: data.text }
                        ],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.1
                    });

                    let aiText = completion.choices[0].message.content;
                    aiText = sanitizeAiResponse(aiText);
                    
                    let audioB64 = null;
                    if (aiText.trim() && data.fastMode !== true) {
                        const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoice}`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ text: aiText })
                        });
                        const arrayBuffer = await response.arrayBuffer();
                        audioB64 = Buffer.from(arrayBuffer).toString('base64');
                    }

                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));
                } catch(e) { console.error("Error Texto:", e.message); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});