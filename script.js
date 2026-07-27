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
let conn = null;          // الاتصال بالصديق
let isConnected = false;
let myPeerId = '';

// --- متغيرات التسجيل ---
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let startTime = null;
let timerInterval = null;
let recordedBlob = null;  // آخر صوت سجلناه

// --- 1. تهيئة PeerJS ---
function initializePeer(id) {
  if (peer) {
    peer.destroy();
    peer = null;
  }

  peer = new Peer(id, {
    // خوادم STUN/TURN لضمان الاتصال (مجانية)
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
    // إذا كان المعرف مختلفًا عن الذي كتبناه، نحدث الحقل
    if (myIdInput.value !== assignedId) {
      myIdInput.value = assignedId;
    }
  });

  peer.on('connection', (incomingConn) => {
    // شخص آخر يحاول الاتصال بنا
    if (conn) {
      // إذا كنا متصلين بالفعل، نرفض الاتصال الجديد
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

// --- 2. إعداد قنوات الاتصال بعد قبول/إنشاء الاتصال ---
function setupConnection(connection) {
  conn = connection;
  isConnected = true;
  setStatus(`✅ متصل بـ ${conn.peer}`);
  connectBtn.textContent = '✅ متصل';
  connectBtn.disabled = true;
  sendBtn.disabled = false;
  recordBtn.disabled = false;

  // استقبال البيانات (الرسائل الصوتية)
  conn.on('data', (data) => {
    if (data.type === 'audio') {
      // استقبال الصوت كـ ArrayBuffer وتحويله إلى Blob
      const blob = new Blob([data.payload], { type: 'audio/webm' });
      addMessageToUI(blob, `من ${conn.peer}`);
    }
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

// --- 3. زر الاتصال ---
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

  // إذا لم يكن هناك peer أو أن المعرف تغير، نعيد تهيئته
  if (!peer || peer.id !== myId) {
    initializePeer(myId);
  }

  // إذا كنا متصلين بالفعل، لا تفعل شيئًا
  if (isConnected) {
    alert('أنت متصل بالفعل!');
    return;
  }

  setStatus('جاري الاتصال...');
  connectBtn.disabled = true;

  // محاولة الاتصال بالصديق
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

// --- 4. زر اسم عشوائي ---
randomIdBtn.addEventListener('click', () => {
  const random = 'user_' + Math.floor(Math.random() * 100000);
  myIdInput.value = random;
  // نعيد تهيئة peer مع المعرف الجديد
  if (peer) {
    peer.destroy();
    peer = null;
  }
  initializePeer(random);
});

// --- 5. التسجيل الصوتي ---
recordBtn.addEventListener('click', async function() {
  if (isRecording) {
    // إيقاف التسجيل
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    return;
  }

  // طلب المايك
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

// --- 6. إرسال الصوت للصديق ---
sendBtn.addEventListener('click', () => {
  if (!isConnected || !conn) {
    alert('أنت غير متصل بصديق!');
    return;
  }
  if (!recordedBlob) {
    alert('سجل صوتًا أولاً.');
    return;
  }

  // تحويل الـ Blob إلى ArrayBuffer لإرساله عبر قناة البيانات
  const reader = new FileReader();
  reader.onload = function(e) {
    const arrayBuffer = e.target.result;
    conn.send({
      type: 'audio',
      payload: arrayBuffer
    });
    // نضيف الصوت إلى قائمتنا كرسالة مرسلة
    addMessageToUI(recordedBlob, 'أنا (مرسل)');
    alert('✅ تم إرسال الصوت للصديق!');
  };
  reader.readAsArrayBuffer(recordedBlob);
});

// --- 7. إضافة رسالة إلى واجهة المستخدم (محلية) ---
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
    // تحرير الرابط من الذاكرة
    URL.revokeObjectURL(url);
  });

  msgDiv.appendChild(audioEl);
  msgDiv.appendChild(infoSpan);
  msgDiv.appendChild(deleteBtn);

  // إزالة رسالة "لا توجد رسائل"
  const placeholder = messagesList.querySelector('p');
  if (placeholder) placeholder.remove();

  messagesList.appendChild(msgDiv);
}

// --- 8. حالة الاتصال ---
function setStatus(text) {
  connectionStatus.textContent = text;
}

// --- 9. تحميل أولي (بدء التشغيل) ---
window.addEventListener('load', () => {
  const defaultId = 'user_' + Math.floor(Math.random() * 10000);
  myIdInput.value = defaultId;
  initializePeer(defaultId);
  recordBtn.disabled = true; // ننتظر الاتصال
  sendBtn.disabled = true;
});