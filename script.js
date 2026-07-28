// --- عناصر الصفحة ---
const myIdInput = document.getElementById('myId');
const friendIdInput = document.getElementById('friendId');
const connectBtn = document.getElementById('connectBtn');
const randomIdBtn = document.getElementById('randomIdBtn');
const connectionStatus = document.querySelector('#connectionStatus span');

const recordBtn = document.getElementById('recordBtn');
const timerDisplay = document.getElementById('timer');
const previewAudio = document.getElementById('previewAudio');
const sendBtn = document.getElementById('sendBtn');
const messagesList = document.getElementById('messagesList');

// --- متغيرات PeerJS ---
let peer = null;
let conn = null;
let isConnected = false;
let myPeerId = '';

// --- متغيرات التسجيل ---
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let startTime = null;
let timerInterval = null;
let recordedBlob = null;

// --- متغيرات استقبال الملفات المقطعة (Chunked File Receiver) ---
let receivingFile = {
  isActive: false,
  chunks: [],
  totalChunks: 0,
  senderName: ''
};

// --- 1. تهيئة PeerJS ---
function initializePeer(id) {
  if (peer) {
    peer.destroy();
    peer = null;
  }

  peer = new Peer(id, {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  });

  peer.on('open', (assignedId) => {
    myPeerId = assignedId;
    setStatus(`جاهز (معرفك: ${assignedId})`);
    connectBtn.disabled = false;
    if (myIdInput.value !== assignedId) {
      myIdInput.value = assignedId;
    }
  });

  peer.on('connection', (incomingConn) => {
    if (conn) {
      incomingConn.close();
      return;
    }
    conn = incomingConn;
    setupConnection(conn);
  });

  peer.on('error', (err) => {
    console.error('PeerJS error:', err);
    if (err.type === 'unavailable-id') {
      alert(`الاسم "${id}" مستخدم بالفعل. اختر اسمًا آخر أو اضغط "اسم عشوائي".`);
      connectBtn.disabled = false;
    } else {
      setStatus('خطأ في الاتصال');
      connectBtn.disabled = false;
    }
  });
}

// --- 2. إعداد قنوات الاتصال ---
function setupConnection(connection) {
  conn = connection;
  isConnected = true;
  setStatus(`✅ متصل بـ ${conn.peer}`);
  connectBtn.textContent = '✅ متصل';
  connectBtn.disabled = true;
  sendBtn.disabled = false;
  recordBtn.disabled = false;

  conn.on('data', (data) => {
    // معالجة البيانات القادمة (سواء كانت نصية أو أجزاء صوت)
    handleIncomingData(data);
  });

  conn.on('close', () => {
    isConnected = false;
    setStatus('❌ انقطع الاتصال');
    connectBtn.textContent = '🔗 اتصل بالصديق';
    connectBtn.disabled = false;
    sendBtn.disabled = true;
    recordBtn.disabled = true;
    conn = null;
  });
}

// --- 3. معالجة البيانات الواردة (للاستقبال) ---
function handleIncomingData(data) {
  // حالة 1: استقبال جزء من ملف (Chunk)
  if (data.type === 'audio-chunk') {
    // إذا لم تكن عملية الاستقبال مفعلة، نبدأها
    if (!receivingFile.isActive) {
      receivingFile.isActive = true;
      receivingFile.chunks = [];
      receivingFile.totalChunks = data.totalChunks;
      receivingFile.senderName = data.sender || 'صديق';
    }

    // تخزين الجزء في المكان الصحيح (حسب رقمه)
    receivingFile.chunks[data.index] = data.payload;

    // التحقق إذا كان هذا هو الجزء الأخير
    if (data.index === data.totalChunks - 1) {
      // اكتمل الملف، نقوم بتجميعه
      try {
        // دمج جميع الأجزاء (Uint8Arrays) في ArrayBuffer واحد
        const totalLength = receivingFile.chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
        const mergedArray = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of receivingFile.chunks) {
          mergedArray.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }

        // تحويل ArrayBuffer إلى Blob
        const blob = new Blob([mergedArray.buffer], { type: 'audio/webm' });
        
        // إضافة الرسالة إلى واجهة المستخدم
        addMessageToUI(blob, `من ${receivingFile.senderName}`);
        
        // إعادة تعيين حالة الاستقبال
        receivingFile.isActive = false;
        receivingFile.chunks = [];
      } catch (e) {
        console.error('خطأ في تجميع الملف:', e);
        receivingFile.isActive = false;
        receivingFile.chunks = [];
      }
    }
  }
  // حالة 2: رسالة نصية عادية (للتنبيهات)
  else if (data.type === 'text') {
    console.log('رسالة نصية:', data.message);
  }
}

// --- 4. زر الاتصال ---
connectBtn.addEventListener('click', () => {
  const myId = myIdInput.value.trim();
  const friendId = friendIdInput.value.trim();

  if (!myId || !friendId) {
    alert('الرجاء إدخال اسمك واسم الصديق.');
    return;
  }
  if (myId === friendId) {
    alert('لا يمكن أن يكون اسمك مطابقًا لاسم الصديق!');
    return;
  }

  if (!peer || peer.id !== myId) {
    initializePeer(myId);
  }

  if (isConnected) {
    alert('أنت متصل بالفعل!');
    return;
  }

  setStatus('جاري الاتصال...');
  connectBtn.disabled = true;

  const newConn = peer.connect(friendId, { reliable: true });
  newConn.on('open', () => {
    setupConnection(newConn);
  });
  newConn.on('error', (err) => {
    console.error('فشل الاتصال:', err);
    alert(`لا يمكن الاتصال بـ "${friendId}". تأكد أنه متصل بالإنترنت وفتح الصفحة بنفس الاسم.`);
    setStatus('فشل الاتصال');
    connectBtn.disabled = false;
    connectBtn.textContent = '🔗 اتصل بالصديق';
  });
});

// --- 5. زر اسم عشوائي ---
randomIdBtn.addEventListener('click', () => {
  const random = 'user_' + Math.floor(Math.random() * 100000);
  myIdInput.value = random;
  if (peer) {
    peer.destroy();
    peer = null;
  }
  initializePeer(random);
});

// --- 6. التسجيل الصوتي ---
recordBtn.addEventListener('click', async function() {
  if (isRecording) {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
      clearInterval(timerInterval);
      isRecording = false;
      recordBtn.textContent = 'اضغط للتسجيل';
      recordBtn.classList.remove('recording');

      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      recordedBlob = blob;
      const url = URL.createObjectURL(blob);
      previewAudio.src = url;
      previewAudio.controls = true;
      sendBtn.disabled = false;
      stream.getTracks().forEach(t => t.stop());
    };

    mediaRecorder.start();
    isRecording = true;
    recordBtn.textContent = '⏹️ إيقاف التسجيل';
    recordBtn.classList.add('recording');
    startTime = Date.now();
    timerInterval = setInterval(updateTimer, 200);

  } catch (err) {
    alert('الرجاء السماح بالوصول إلى المايكروفون.');
    console.error(err);
  }
});

function updateTimer() {
  if (!startTime) return;
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');
  timerDisplay.textContent = `${mins}:${secs}`;
}

// --- 7. إرسال الصوت للصديق (مع التقطيع) ---
sendBtn.addEventListener('click', () => {
  if (!isConnected || !conn) {
    alert('أنت غير متصل بصديق!');
    return;
  }
  if (!recordedBlob) {
    alert('سجل صوتًا أولاً.');
    return;
  }

  // تحويل Blob إلى ArrayBuffer أولاً
  const reader = new FileReader();
  reader.onload = function(e) {
    const arrayBuffer = e.target.result;
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // حجم القطعة الواحدة: 15 كيلوبايت (آمن لـ PeerJS)
    const CHUNK_SIZE = 15 * 1024; 
    const totalChunks = Math.ceil(uint8Array.length / CHUNK_SIZE);
    
    // إرسال إشعار نصي (اختياري) ببدء الإرسال
    conn.send({ type: 'text', message: 'جاري إرسال ملف صوتي...' });

    // تقسيم الملف وإرسال كل قطعة على حدة
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, uint8Array.length);
      const chunk = uint8Array.slice(start, end);
      
      conn.send({
        type: 'audio-chunk',
        index: i,
        totalChunks: totalChunks,
        sender: myIdInput.value || 'أنا',
        payload: chunk.buffer // نرسل الـ ArrayBuffer مباشرة
      });
    }

    // نضيف الصوت إلى قائمتنا المحلية كرسالة مرسلة
    addMessageToUI(recordedBlob, 'أنا (مرسل)');
    alert(`✅ تم إرسال الصوت (مقسماً إلى ${totalChunks} قطعة)!`);
  };
  reader.readAsArrayBuffer(recordedBlob);
});

// --- 8. إضافة رسالة إلى واجهة المستخدم ---
function addMessageToUI(blob, sender) {
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const timeStr = now.toLocaleString('ar-EG');

  const msgDiv = document.createElement('div');
  msgDiv.className = 'msg-item';

  const audioEl = document.createElement('audio');
  audioEl.controls = true;
  audioEl.src = url;

  const infoSpan = document.createElement('span');
  infoSpan.className = 'info';
  infoSpan.textContent = `${sender} - ${timeStr}`;

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = '🗑️ حذف';
  deleteBtn.addEventListener('click', () => {
    msgDiv.remove();
    URL.revokeObjectURL(url);
  });

  msgDiv.appendChild(audioEl);
  msgDiv.appendChild(infoSpan);
  msgDiv.appendChild(deleteBtn);

  const placeholder = messagesList.querySelector('p');
  if (placeholder) placeholder.remove();

  messagesList.appendChild(msgDiv);
}

// --- 9. حالة الاتصال ---
function setStatus(text) {
  connectionStatus.textContent = text;
}

// --- 10. تحميل أولي ---
window.addEventListener('load', () => {
  const defaultId = 'user_' + Math.floor(Math.random() * 10000);
  myIdInput.value = defaultId;
  initializePeer(defaultId);
  recordBtn.disabled = true;
  sendBtn.disabled = true;
});