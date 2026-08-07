const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const FINISH_POSITION = 30;
const MAX_PLAYERS = 4;
const RECONNECT_GRACE_MS = 2 * 60 * 1000;
const ROOM_IDLE_MS = 10 * 60 * 1000;

const Questions = [
  { q: "Что такое интернет, если говорить простыми словами?", a: ["Специальная программа для игр", "Всемирная сеть, объединяющая компьютеры", "Главный сайт для перехода на другие страницы"], c: 1 },
  { q: "Какой тип подключения к интернету считается наиболее надёжным?", a: ["Через телефонную сеть", "По выделенной линии (проводное)", "Спутниковое подключение"], c: 1 },
  { q: "Что такое интернет-браузер?", a: ["Устройство для подключения к интернету", "Программа для просмотра сайтов", "Сайт, где хранятся пароли"], c: 1 },
  { q: "Для чего нужна адресная строка в браузере?", a: ["Чтобы сохранять картинки", "Чтобы вводить адрес сайта и переходить на него", "Чтобы писать тексты писем"], c: 1 },
  { q: "Что произойдёт, если сделать ошибку при вводе адреса сайта?", a: ["Компьютер сам исправит ошибку", "Вы попадёте на другой сайт или увидите ошибку", "Откроется пустая страница"], c: 1 },
  { q: "Какой адрес сайта написан правильно?", a: ["kremlin, ru", "kremlin.ru", "www.kremlin/ru"], c: 1 },
  { q: "Как понять, что текст или картинка являются гиперссылкой?", a: ["Курсор меняет форму на руку с пальцем", "Они выделены жирным шрифтом", "Они всегда в верхнем меню"], c: 0 },
  { q: "Зачем нужны «Закладки» в браузере?", a: ["Чтобы не вводить адрес сайта каждый раз", "Чтобы добавлять страницы для печати", "Чтобы отмечать страницы для удаления"], c: 0 },
  { q: "Что нужно нажать, чтобы перейти на сайт после ввода адреса?", a: ["Пробел", "Enter", "Shift"], c: 1 },
  { q: "Где можно скачать Яндекс.Браузер?", a: ["Он уже есть в Windows", "На официальном сайте Яндекса", "По электронной почте"], c: 1 },
  { q: "Для чего нужна поисковая система?", a: ["Чтобы сохранять все открытые сайты", "Чтобы находить нужную информацию по запросу", "Чтобы защищать компьютер от вирусов"], c: 1 },
  { q: "Какой запрос поможет найти рецепт быстрее всего?", a: ["«где найти хороший рецепт пирога»", "«рецепт яблочного пирога»", "«я хочу испечь пирог»"], c: 1 },
  { q: "Что вы увидите на странице с результатами поиска?", a: ["Список сайтов с описанием и ссылкой", "Полные тексты всех статей", "Только адреса сайтов без пояснений"], c: 0 },
  { q: "Если не нашли информацию на первой странице поиска, что делать?", a: ["Перейти на вторую страницу результатов", "Перезагрузить компьютер", "Сменить браузер"], c: 0 },
  { q: "Как найти картинки по запросу?", a: ["После поиска нажать вкладку «Картинки»", "Набрать запрос заглавными буквами", "Добавить слово «фото»"], c: 0 },
  { q: "Как сохранить картинку на компьютер?", a: ["Дважды щёлкнуть левой кнопкой", "Правой кнопкой → «Сохранить изображение как...»", "Нажать колесо мыши"], c: 1 },
  { q: "В чём разница между сохранением всей страницы и HTML?", a: ["Вся страница — текст и картинки, HTML — только текст", "Вся страница — только картинка, HTML — только текст", "HTML занимает больше места"], c: 0 },
  { q: "Можно ли использовать чужую фотографию для своей открытки?", a: ["Можно, если не в коммерческих целях", "Можно, если из открытых источников", "Нельзя без разрешения автора, кроме случаев, указанных в законе"], c: 2 },
  { q: "Как с помощью поисковика быстро узнать прогноз погоды?", a: ["Ввести «погода» и название города", "Нажать кнопку «Карты»", "Поисковики не показывают погоду"], c: 0 },
  { q: "Какую информацию чаще всего нельзя скачать бесплатно?", a: ["Новые фильмы и музыку", "Погоду на завтра", "Новости дня"], c: 0 },
  { q: "Как вредоносная программа чаще всего попадает на компьютер?", a: ["Вместе с полезной программой из интернета", "Через перепады напряжения", "Автоматически при включении"], c: 0 },
  { q: "Что такое фишинг?", a: ["Мошенничество с поддельным сайтом", "Компьютерная игра для хакеров", "Антивирусная программа"], c: 0 },
  { q: "Какой признак НЕ указывает на заражение вирусом?", a: ["Компьютер начал работать быстрее", "Компьютер часто зависает", "Браузер открывает не ту страницу"], c: 0 },
  { q: "Зачем нужна антивирусная программа?", a: ["Чтобы ускорить загрузку страниц", "Чтобы обнаруживать и обезвреживать вирусы", "Чтобы подключаться к Wi-Fi"], c: 1 },
  { q: "Что такое демо-версия антивируса?", a: ["Полностью бесплатная версия", "Пробная версия с ограниченным временем", "Версия без обновлений"], c: 1 },
  { q: "Что НЕЛЬЗЯ делать ни в коем случае?", a: ["Называть пароль по телефону «сотруднику банка»", "Записывать пароль в блокнот дома", "Менять пароль раз в полгода"], c: 0 },
  { q: "Какой пароль сложнее всего взломать?", a: ["Буквы и цифры, не связанные с жизнью (kL7$#pR2)", "Дата рождения", "Имя кота"], c: 0 },
  { q: "Что делать с письмом, которое просит срочно подтвердить данные карты?", a: ["Перейти по ссылке и проверить", "Удалить — это мошенники", "Переслать в поддержку банка"], c: 1 },
  { q: "Что означает значок «замочек» в адресной строке?", a: ["Сайт не требует регистрации", "Данные на сайте защищены", "Сайт находится за границей"], c: 1 },
  { q: "Если мошенники узнали данные вашей карты, что они могут сделать?", a: ["Списать деньги с вашей карты", "Изменить пароль на компьютере", "Сломать принтер"], c: 0 },
  { q: "Для чего нужна электронная почта?", a: ["Для обмена письмами через интернет", "Для видеозвонков", "Для поиска файлов на компьютере"], c: 0 },
  { q: "Как выглядит правильный адрес электронной почты?", a: ["petrov@yandex.ru", "petrov.yandex.ru", "petrov@yandex@ru"], c: 0 },
  { q: "Что нужно сделать, чтобы завести почтовый ящик?", a: ["Зарегистрироваться на специальном сайте", "Купить у провайдера", "Установить программу"], c: 0 },
  { q: "Где хранятся письма, которые вам прислали?", a: ["В папке «Входящие»", "В папке «Отправленные»", "В папке «Черновики»"], c: 0 },
  { q: "Как понять, что пришло новое письмо?", a: ["Напротив «Входящие» появится цифра", "Компьютер перезагрузится", "Прозвучит неотключаемый сигнал"], c: 0 },
  { q: "Как отправить фотографию по почте?", a: ["Прикрепить файл (значок скрепки)", "Вставить в строку «Кому»", "Отправить ссылку в тексте"], c: 0 },
  { q: "Если случайно удалили важное письмо, где его найти?", a: ["В папке «Удалённые»", "В папке «Спам»", "Оно исчезает навсегда"], c: 0 },
  { q: "Для чего служит клавиша Shift при наборе адреса почты?", a: ["Чтобы поставить «@» или заглавную букву", "Чтобы поставить пробел", "Чтобы удалить символ"], c: 0 },
  { q: "Куда попадают письма с рекламой и сомнительным содержанием?", a: ["В папку «Спам»", "В папку «Черновики»", "В папку «Отправленные»"], c: 0 },
  { q: "Можно ли отправить одно письмо сразу нескольким людям?", a: ["Да, указав их адреса в поле «Кому»", "Нет, только одному", "Да, но если они дружат"], c: 0 }
];

const SpecialCells = {
  5:  { icon: '📶', title: '📶 Надёжный Wi-Fi', effect: { type: 'move', value: 2 }, description: 'Вы попали на клетку «Надёжный Wi-Fi»! Перемещаетесь вперёд на 2 клетки.' },
  9:  { icon: '🔒', title: '🔒 Надёжный пароль', effect: { type: 'extraTurn' }, description: 'Вы попали на клетку «Надёжный пароль»! Вы получаете дополнительный ход.' },
  12: { icon: '📧', title: '📧 Полезное письмо', effect: { type: 'extraQuestion' }, description: 'Вы попали на клетку «Полезное письмо»! Вы получаете дополнительный вопрос.' },
  15: { icon: '🐞', title: '🐞 Поймали вирус', effect: { type: 'skipNext' }, description: 'Вы попали на клетку «Поймали вирус»! Ваш следующий ход пропускается.' },
  18: { icon: '⚠️', title: '⚠️ Подозрительная ссылка', effect: { type: 'move', value: -3 }, description: 'Вы попали на клетку «Подозрительная ссылка»! Вы отодвигаетесь назад на 3 клетки.' },
  21: { icon: '💾', title: '💾 Резервная копия', effect: { type: 'move', value: 2 }, description: 'Вы попали на клетку «Резервная копия»! Перемещаетесь вперёд на 2 клетки.' },
  25: { icon: '🛡️', title: '🛡️ Двухфакторная аутентификация', effect: { type: 'move', value: 4 }, description: 'Вы попали на клетку «Двухфакторная аутентификация»! Перемещаетесь вперёд на 4 клетки.' },
  28: { icon: '📚', title: '📚 Полезный курс', effect: { type: 'extraQuestion' }, description: 'Вы попали на клетку «Полезный курс»! Вы получаете дополнительный вопрос.' }
};

function generateRoomId() {
  let id, attempts = 0;
  do { id = Math.random().toString(36).substring(2, 8).toUpperCase(); attempts++; }
  while (rooms.has(id) && attempts < 100);
  return id;
}

function isLatin(str) { return /[a-zA-Z]/.test(str); }

function sortPlayersByName(playersArray) {
  return [...playersArray]
    .map(p => ({ name: p.name, id: p.id }))
    .sort((a, b) => {
      const aLat = isLatin(a.name);
      const bLat = isLatin(b.name);
      if (aLat !== bLat) return aLat ? -1 : 1;
      return a.name.localeCompare(b.name, aLat ? 'en' : 'ru', { sensitivity: 'base' });
    })
    .map(x => x.id);
}

function getRandomQuestion(usedQuestions) {
  if (usedQuestions.length >= Questions.length) usedQuestions.splice(0, usedQuestions.length);
  let idx, attempts = 0;
  do { idx = Math.floor(Math.random() * Questions.length); attempts++; }
  while (usedQuestions.includes(idx) && attempts < 200);
  return usedQuestions.includes(idx) ? null : idx;
}

function rollDice() { return Math.floor(Math.random() * 6) + 1; }

function makePlayer(socketId, name, character, isHost = false, isBot = false) {
  return { id: socketId, name, character, position: 1, correct: 0, moves: 0,
           skipNext: false, isHost, isBot, disconnected: false, disconnectedAt: null };
}

function isNameOrAvatarTaken(room, name, characterId) {
  const lowerName = name.toLowerCase();
  for (const player of room.players.values()) {
    if (player.name.toLowerCase() === lowerName) return 'name';
    if (player.character && player.character.id === characterId) return 'avatar';
  }
  return null;
}

function getRoomState(room) {
  return { roomId: room.id, players: Array.from(room.players.values()),
           turnOrder: room.turnOrder, currentTurnIndex: room.currentTurnIndex,
           finished: room.finished, started: room.started,
           waitingForAnswer: room.waitingForAnswer, currentQuestion: room.currentQuestion,
           currentDiceValue: room.currentDiceValue, isExtraQuestion: room.isExtraQuestion,
           hasBot: room.hasBot || false };
}

function getRoomAndPlayer(socket) {
  const roomId = socket.data.roomId;
  if (!roomId || !rooms.has(roomId)) return null;
  const room = rooms.get(roomId);
  const player = room.players.get(socket.id);
  if (!player || player.disconnected) return null;
  return { room, player };
}

function createRoom(hostSocketId, playerName, character) {
  const roomId = generateRoomId();
  const room = {
    id: roomId, hostId: hostSocketId, players: new Map(), turnOrder: [],
    currentTurnIndex: 0, usedQuestions: [], started: false, finished: false,
    waitingForAnswer: false, diceRolling: false, currentQuestion: null,
    currentDiceValue: 0, isExtraQuestion: false, virusQueue: [],
    lastActivity: Date.now(), stuckReports: new Map(), botProcessing: false, hasBot: false
  };
  room.players.set(hostSocketId, makePlayer(hostSocketId, playerName, character, true, false));
  rooms.set(roomId, room);
  return room;
}

function updateTurnOrder(room) {
  const prevId = room.turnOrder.length > 0 ? room.turnOrder[room.currentTurnIndex] : null;
  const prevIdx = room.currentTurnIndex;
  const newOrder = sortPlayersByName(
    Array.from(room.players.values()).filter(p => !p.disconnected)
  );
  room.turnOrder = newOrder;
  if (newOrder.length === 0) { room.currentTurnIndex = 0; return; }
  if (prevId && newOrder.includes(prevId)) {
    room.currentTurnIndex = newOrder.indexOf(prevId);
  } else {
    room.currentTurnIndex = Math.min(prevIdx, newOrder.length - 1);
    if (!room.players.has(newOrder[room.currentTurnIndex])) room.currentTurnIndex = 0;
  }
}

function normalizeTurn(room) {
  if (room.turnOrder.length === 0) return null;
  if (room.currentTurnIndex >= room.turnOrder.length) room.currentTurnIndex = 0;
  const anyActive = room.turnOrder.some(id => {
    const p = room.players.get(id);
    return p && !p.skipNext && !p.disconnected;
  });
  if (!anyActive) {
    room.players.forEach(p => { p.skipNext = false; });
    room.virusQueue = [];
  }
  let attempts = 0;
  let cur = room.players.get(room.turnOrder[room.currentTurnIndex]);
  while (cur && (cur.skipNext || cur.disconnected) && attempts < room.turnOrder.length) {
    if (cur.skipNext) {
      cur.skipNext = false;
      room.virusQueue = room.virusQueue.filter(id => id !== cur.id);
      io.to(room.id).emit('turnSkipped', { playerName: cur.name, state: getRoomState(room) });
    }
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
    cur = room.players.get(room.turnOrder[room.currentTurnIndex]);
    attempts++;
  }
  return room.players.get(room.turnOrder[room.currentTurnIndex]) || null;
}

function advanceTurn(room) {
  if (room.finished) return;
  room.isExtraQuestion = false;
  room.currentQuestion = null;
  room.currentDiceValue = 0;
  room.waitingForAnswer = false;
  room.diceRolling = false;
  if (room.turnOrder.length === 0) return;
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
  const player = normalizeTurn(room);
  io.to(room.id).emit('turnChanged', {
    state: getRoomState(room),
    currentPlayerName: player ? player.name : ''
  });
  if (player && player.isBot) scheduleBotTurn(room, 1200);
}

function endGame(room) {
  room.finished = true;
  room.waitingForAnswer = false;
  room.diceRolling = false;
  room.currentQuestion = null;
  room.currentDiceValue = 0;
  room.botProcessing = false;
  const sorted = Array.from(room.players.values()).sort((a, b) => {
    const aFin = a.position >= FINISH_POSITION ? 1 : 0;
    const bFin = b.position >= FINISH_POSITION ? 1 : 0;
    if (bFin !== aFin) return bFin - aFin;
    if (b.correct !== a.correct) return b.correct - a.correct;
    return a.moves - b.moves;
  });
  io.to(room.id).emit('gameEnded', { winner: sorted[0], rating: sorted, state: getRoomState(room) });
}

function beginGame(room) {
  room.players.forEach(p => {
    p.position = 1; p.correct = 0; p.moves = 0; p.skipNext = false;
  });
  room.turnOrder = sortPlayersByName(
    Array.from(room.players.values()).filter(p => !p.disconnected)
  );
  room.currentTurnIndex = 0;
  room.started = true;
  room.finished = false;
  room.lastActivity = Date.now();
  room.usedQuestions = [];
  room.currentQuestion = null;
  room.currentDiceValue = 0;
  room.waitingForAnswer = false;
  room.diceRolling = false;
  room.isExtraQuestion = false;
  room.virusQueue = [];
  room.botProcessing = false;
  if (room.stuckReports) room.stuckReports.clear();
  io.to(room.id).emit('gameStarted', { state: getRoomState(room) });
  const first = room.players.get(room.turnOrder[0]);
  if (first && first.isBot) scheduleBotTurn(room, 2000);
}

function cleanupRoomAfterChange(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.players.size === 0) {
    rooms.delete(roomId);
    return;
  }
  const connectedHumans = Array.from(room.players.values()).filter(p => !p.isBot && !p.disconnected);
  const host = room.players.get(room.hostId);
  if ((!host || host.disconnected || host.isBot) && connectedHumans.length > 0) {
    const newHost = connectedHumans[0];
    room.hostId = newHost.id;
    room.players.forEach(p => { if (!p.isBot) p.isHost = (p.id === room.hostId); });
    io.to(roomId).emit('hostChanged', { state: getRoomState(room) });
  }
  if (connectedHumans.length === 0) {
    if (!room.started) { rooms.delete(roomId); return; }
    const hasDisconnected = Array.from(room.players.values()).some(p => p.disconnected);
    if (!hasDisconnected) rooms.delete(roomId);
  }
}

function createBotPlayer(room) {
  const botNames = ['🤖 Робот', '🧠 ИИ-соперник', '⚡ Электроник', '💻 Компьютер', '🤖 Бот'];
  const allCharacters = [
    { id: 3, gender: 'animal', hair: 'cat', skin: 'light' },
    { id: 6, gender: 'animal', hair: 'dog', skin: 'light' },
    { id: 4, gender: 'male', hair: 'black', skin: 'light' },
    { id: 1, gender: 'female', hair: 'blonde', skin: 'light' },
    { id: 7, gender: 'male', hair: 'darkchestnut', skin: 'tan' },
    { id: 2, gender: 'female', hair: 'brown', skin: 'light' },
    { id: 5, gender: 'male', hair: 'red', skin: 'tan' },
    { id: 0, gender: 'female', hair: 'black', skin: 'tan' }
  ];
  const takenIds = new Set(
    Array.from(room.players.values())
      .filter(p => p.character && typeof p.character.id === 'number')
      .map(p => p.character.id)
  );
  const freeCharacters = allCharacters.filter(c => !takenIds.has(c.id));
  const character = freeCharacters.length > 0
    ? freeCharacters[Math.floor(Math.random() * freeCharacters.length)]
    : allCharacters[Math.floor(Math.random() * allCharacters.length)];
  return makePlayer(
    `bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    botNames[Math.floor(Math.random() * botNames.length)],
    character, false, true
  );
}

function botGetAnswer(question, difficulty) {
  if (Math.random() < difficulty) return question.c;
  const wrong = question.a.map((_, i) => i).filter(i => i !== question.c);
  if (wrong.length === 0) return question.c;
  return wrong[Math.floor(Math.random() * wrong.length)];
}

function scheduleBotTurn(room, baseDelay = 1200) {
  if (room.finished || room.turnOrder.length === 0) return;
  const playerId = room.turnOrder[room.currentTurnIndex];
  const player = room.players.get(playerId);
  if (!player || !player.isBot || room.botProcessing) return;
  room.botProcessing = true;
  const delay = baseDelay + Math.random() * 1300;
  setTimeout(() => runBotTurn(room, playerId), delay);
}

function runBotTurn(room, botId) {
  const fail = () => { room.botProcessing = false; };
  if (!rooms.has(room.id) || room.finished) return fail();
  if (room.turnOrder[room.currentTurnIndex] !== botId) return fail();
  const player = room.players.get(botId);
  if (!player || !player.isBot || player.disconnected) return fail();
  if (player.skipNext) {
    player.skipNext = false;
    room.virusQueue = room.virusQueue.filter(id => id !== botId);
    io.to(room.id).emit('turnSkipped', { playerName: player.name, state: getRoomState(room) });
    room.botProcessing = false;
    advanceTurn(room);
    return;
  }
  const diceValue = rollDice();
  room.currentDiceValue = diceValue;
  room.diceRolling = true;
  player.moves++;
  room.lastActivity = Date.now();
  io.to(room.id).emit('diceRolled', { value: diceValue, state: getRoomState(room) });
  setTimeout(() => {
    if (!rooms.has(room.id) || room.finished) return fail();
    if (room.turnOrder[room.currentTurnIndex] !== botId) return fail();
    const qIdx = getRandomQuestion(room.usedQuestions);
    if (qIdx === null) {
      room.botProcessing = false;
      io.to(room.id).emit('message', { text: 'Вопросы закончились, ход передан', type: 'warning' });
      advanceTurn(room);
      return;
    }
    room.usedQuestions.push(qIdx);
    room.currentQuestion = Questions[qIdx];
    room.waitingForAnswer = true;
    room.diceRolling = false;
    const askedQuestion = room.currentQuestion;
    io.to(room.id).emit('questionShown', {
      question: room.currentQuestion, diceValue, state: getRoomState(room)
    });
    setTimeout(() => {
      if (!rooms.has(room.id) || room.finished) return fail();
      if (!room.waitingForAnswer) return fail();
      if (room.turnOrder[room.currentTurnIndex] !== botId) return fail();
      if (room.currentQuestion !== askedQuestion) return fail();
      const difficulty = 0.5 + Math.random() * 0.35;
      const answer = botGetAnswer(askedQuestion, difficulty);
      io.to(room.id).emit('answerSelected', { answerIndex: answer, playerName: player.name });
      setTimeout(() => {
        if (!rooms.has(room.id) || room.finished) return fail();
        if (!room.waitingForAnswer) return fail();
        if (room.turnOrder[room.currentTurnIndex] !== botId) return fail();
        if (room.currentQuestion !== askedQuestion) return fail();
        room.botProcessing = false;
        resolveAnswer(room, player, answer);
      }, 900);
    }, 1500 + Math.random() * 1500);
  }, 1800);
}

function scheduleBotAnswer(room, player) {
  const askedQuestion = room.currentQuestion;
  setTimeout(() => {
    if (!rooms.has(room.id) || room.finished || !room.waitingForAnswer) return;
    if (room.turnOrder[room.currentTurnIndex] !== player.id) return;
    if (!room.players.has(player.id)) return;
    if (room.currentQuestion !== askedQuestion) return;
    const difficulty = 0.5 + Math.random() * 0.35;
    const answer = botGetAnswer(askedQuestion, difficulty);
    io.to(room.id).emit('answerSelected', { answerIndex: answer, playerName: player.name });
    setTimeout(() => {
      if (!rooms.has(room.id) || room.finished || !room.waitingForAnswer) return;
      if (room.turnOrder[room.currentTurnIndex] !== player.id) return;
      if (room.currentQuestion !== askedQuestion) return;
      resolveAnswer(room, player, answer);
    }, 900);
  }, 2000 + Math.random() * 1000);
}

function applySpecialCells(room, startPosition) {
  const result = { finished: false, extraTurn: false, extraQuestion: false,
                   skipNext: false, cells: [], finalPosition: startPosition };
  const playerId = room.turnOrder[room.currentTurnIndex];
  const player = room.players.get(playerId);
  if (!player) return result;
  let pos = startPosition;
  let guard = 0;
  while (SpecialCells[pos] && guard < 10) {
    guard++;
    const sp = SpecialCells[pos];
    result.cells.push(sp);
    const eff = sp.effect;
    if (eff.type === 'move') {
      pos = Math.max(1, Math.min(FINISH_POSITION, pos + eff.value));
      player.position = pos;
      result.finalPosition = pos;
      if (pos >= FINISH_POSITION) { result.finished = true; return result; }
      continue;
    }
    if (eff.type === 'extraTurn') { result.extraTurn = true; break; }
    if (eff.type === 'extraQuestion') { result.extraQuestion = true; break; }
    if (eff.type === 'skipNext') { result.skipNext = true; break; }
    break;
  }
  return result;
}

function resolveAnswer(room, player, chosenIndex) {
  if (!room.currentQuestion) return;
  const correct = room.currentQuestion.c;
  const isCorrect = chosenIndex === correct;
  const dice = room.currentDiceValue;
  const moved = isCorrect && dice > 0;
  room.waitingForAnswer = false;
  room.diceRolling = false;
  room.isExtraQuestion = false;
  room.currentQuestion = null;
  room.currentDiceValue = 0;
  room.lastActivity = Date.now();
  if (isCorrect) {
    player.correct++;
    if (dice > 0) player.position = Math.min(player.position + dice, FINISH_POSITION);
  }
  if (moved && player.position >= FINISH_POSITION) {
    endGame(room);
    io.to(room.id).emit('answerResult', {
      isCorrect, correctAnswer: correct, state: getRoomState(room),
      message: `${player.name} дошёл до финиша!`
    });
    return;
  }
  if (moved && SpecialCells[player.position]) {
    const outcome = applySpecialCells(room, player.position);
    for (const sp of outcome.cells) {
      io.to(room.id).emit('specialCellMessage', {
        title: sp.title, description: sp.description, icon: sp.icon, playerName: player.name
      });
    }
    if (outcome.finished) {
      endGame(room);
      io.to(room.id).emit('answerResult', {
        isCorrect, correctAnswer: correct, state: getRoomState(room),
        message: `${player.name} дошёл до финиша!`
      });
      return;
    }
    if (outcome.extraTurn) {
      io.to(room.id).emit('answerResult', {
        isCorrect, correctAnswer: correct, state: getRoomState(room),
        specialCell: outcome.cells[0], extraTurn: true
      });
      io.to(room.id).emit('turnChanged', {
        state: getRoomState(room), currentPlayerName: player.name
      });
      if (player.isBot) scheduleBotTurn(room, 1500);
      return;
    }
    if (outcome.extraQuestion) {
      const qIdx = getRandomQuestion(room.usedQuestions);
      if (qIdx === null) {
        io.to(room.id).emit('answerResult', { isCorrect, correctAnswer: correct, state: getRoomState(room) });
        advanceTurn(room);
        return;
      }
      room.usedQuestions.push(qIdx);
      room.currentQuestion = Questions[qIdx];
      room.waitingForAnswer = true;
      room.isExtraQuestion = true;
      room.currentDiceValue = 0;
      io.to(room.id).emit('answerResult', {
        isCorrect, correctAnswer: correct, state: getRoomState(room),
        specialCell: outcome.cells[0], isExtraQuestion: true
      });
      io.to(room.id).emit('questionShown', {
        question: room.currentQuestion, diceValue: 0,
        state: getRoomState(room), isExtraQuestion: true
      });
      if (player.isBot) scheduleBotAnswer(room, player);
      return;
    }
    if (outcome.skipNext) {
      player.skipNext = true;
      if (!room.virusQueue.includes(player.id)) room.virusQueue.push(player.id);
      io.to(room.id).emit('answerResult', {
        isCorrect, correctAnswer: correct, state: getRoomState(room),
        specialCell: outcome.cells[0], skipNext: true, turnAdvanced: true
      });
      advanceTurn(room);
      return;
    }
    io.to(room.id).emit('answerResult', {
      isCorrect, correctAnswer: correct, state: getRoomState(room),
      specialCell: outcome.cells[0]
    });
    advanceTurn(room);
    return;
  }
  io.to(room.id).emit('answerResult', {
    isCorrect, correctAnswer: correct, state: getRoomState(room)
  });
  advanceTurn(room);
}

function detachPlayerFromRoom(socket) {
  const roomId = socket.data.roomId;
  socket.data.roomId = null;
  if (!roomId || !rooms.has(roomId)) return;
  const room = rooms.get(roomId);
  const player = room.players.get(socket.id);
  socket.leave(roomId);
  if (room.stuckReports) room.stuckReports.delete(socket.id);
  if (!player || player.isBot) return;
  const wasCurrent = room.turnOrder[room.currentTurnIndex] === socket.id;
  if (!room.started) {
    room.players.delete(socket.id);
    updateTurnOrder(room);
    io.to(roomId).emit('playerLeft', { state: getRoomState(room), name: player.name });
    cleanupRoomAfterChange(roomId);
    return;
  }
  player.disconnected = true;
  player.disconnectedAt = Date.now();
  if (wasCurrent) {
    room.waitingForAnswer = false;
    room.diceRolling = false;
    room.currentQuestion = null;
    room.currentDiceValue = 0;
  }
  updateTurnOrder(room);
  io.to(roomId).emit('playerLeft', { state: getRoomState(room), name: player.name, disconnected: true });
  if (wasCurrent && !room.finished) {
    const next = normalizeTurn(room);
    io.to(roomId).emit('turnChanged', {
      state: getRoomState(room), currentPlayerName: next ? next.name : ''
    });
    if (next && next.isBot) scheduleBotTurn(room, 1500);
  }
  cleanupRoomAfterChange(roomId);
}

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    let changed = false;
    for (const [pid, p] of Array.from(room.players.entries())) {
      if (p.disconnected && now - (p.disconnectedAt || 0) > RECONNECT_GRACE_MS) {
        room.players.delete(pid);
        changed = true;
      }
    }
    if (changed) {
      updateTurnOrder(room);
      io.to(roomId).emit('playerLeft', { state: getRoomState(room) });
    }
    if (room.players.size === 0 || now - room.lastActivity > ROOM_IDLE_MS) {
      rooms.delete(roomId);
      continue;
    }
    cleanupRoomAfterChange(roomId);
  }
}, 60 * 1000);

function validateNameCharacter(playerName, character) {
  const cleanName = String(playerName || '').trim();
  if (!cleanName || cleanName.length < 2 || cleanName.length > 20) {
    return { error: 'Имя должно быть от 2 до 20 символов' };
  }
  if (!character || typeof character.id !== 'number' ||
      !Number.isInteger(character.id) || character.id < 0 || character.id > 7) {
    return { error: 'Некорректный персонаж' };
  }
  return { cleanName };
}

io.on('connection', (socket) => {
  console.log('Подключение:', socket.id);

  socket.on('createRoom', ({ playerName, character } = {}) => {
    const v = validateNameCharacter(playerName, character);
    if (v.error) return socket.emit('error', v.error);
    detachPlayerFromRoom(socket);
    const room = createRoom(socket.id, v.cleanName, character);
    socket.data.roomId = room.id;
    socket.join(room.id);
    room.turnOrder = sortPlayersByName(Array.from(room.players.values()));
    socket.emit('roomCreated', { roomId: room.id, state: getRoomState(room) });
  });

  socket.on('createBotRoom', ({ playerName, character } = {}) => {
    const v = validateNameCharacter(playerName, character);
    if (v.error) return socket.emit('error', v.error);
    detachPlayerFromRoom(socket);
    const room = createRoom(socket.id, v.cleanName, character);
    room.hasBot = true;
    const bot = createBotPlayer(room);
    room.players.set(bot.id, bot);
    socket.data.roomId = room.id;
    socket.join(room.id);
    room.turnOrder = sortPlayersByName(Array.from(room.players.values()));
    socket.emit('roomCreated', { roomId: room.id, state: getRoomState(room) });
    setTimeout(() => {
      if (!rooms.has(room.id)) return;
      const r = rooms.get(room.id);
      if (r.started || r.finished) return;
      const host = r.players.get(r.hostId);
      if (!host || host.disconnected || host.isBot) return;
      beginGame(r);
    }, 1500);
  });

  socket.on('checkRoom', ({ roomId } = {}) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('roomCheckResult', { success: false, error: 'Комната не найдена' });
    if (room.finished) return socket.emit('roomCheckResult', { success: false, error: 'Игра уже завершена' });
    if (room.started) return socket.emit('roomCheckResult', { success: false, error: 'Игра уже началась' });
    if (room.players.size >= MAX_PLAYERS) return socket.emit('roomCheckResult', { success: false, error: 'Комната заполнена' });
    const takenIds = Array.from(room.players.values())
      .filter(p => p.character && typeof p.character.id === 'number')
      .map(p => p.character.id);
    const available = [0, 1, 2, 3, 4, 5, 6, 7].filter(id => !takenIds.includes(id));
    socket.emit('roomCheckResult', { success: true, availableAvatars: available });
  });

  socket.on('joinRoom', ({ roomId, playerName, character } = {}) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('error', 'Комната не найдена');
    if (room.finished) return socket.emit('error', 'Игра уже завершена');
    if (room.started) return socket.emit('error', 'Игра уже началась. Дождитесь окончания партии.');
    if (room.players.size >= MAX_PLAYERS) return socket.emit('error', 'Комната заполнена');
    const v = validateNameCharacter(playerName, character);
    if (v.error) return socket.emit('error', v.error);
    const conflict = isNameOrAvatarTaken(room, v.cleanName, character.id);
    if (conflict === 'name') return socket.emit('error', 'Игрок с таким именем уже есть в комнате. Выберите другое.');
    if (conflict === 'avatar') return socket.emit('error', 'Этот аватар уже занят. Пожалуйста, выберите другой.');
    detachPlayerFromRoom(socket);
    room.players.set(socket.id, makePlayer(socket.id, v.cleanName, character, false, false));
    socket.data.roomId = room.id;
    socket.join(room.id);
    updateTurnOrder(room);
    room.lastActivity = Date.now();
    io.to(room.id).emit('playerJoined', { state: getRoomState(room), name: v.cleanName });
  });

  socket.on('rejoinRoom', ({ roomId, playerName } = {}) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('error', 'Комната удалена');
    if (room.finished) return socket.emit('error', 'Игра уже завершена');
    const cleanName = String(playerName || '').trim().toLowerCase();
    if (!cleanName) return socket.emit('error', 'Игрок не найден в комнате');
    let found = null;
    for (const p of room.players.values()) {
      if (!p.isBot && p.name.toLowerCase() === cleanName) { found = p; break; }
    }
    if (!found) return socket.emit('error', 'Игрок не найден в комнате');
    if (!found.disconnected) return socket.emit('error', 'Игрок уже подключён');
    const oldId = found.id;
    if (oldId !== socket.id) {
      room.players.delete(oldId);
      found.id = socket.id;
      room.players.set(socket.id, found);
    }
    found.disconnected = false;
    found.disconnectedAt = null;
    socket.data.roomId = room.id;
    socket.join(room.id);
    if (room.hostId === oldId) room.hostId = socket.id;
    found.isHost = (room.hostId === socket.id);
    updateTurnOrder(room);
    room.lastActivity = Date.now();
    socket.emit('rejoined', { state: getRoomState(room) });
    socket.to(room.id).emit('playerJoined', { state: getRoomState(room), name: found.name });
  });

  socket.on('startGame', () => {
    const ctx = getRoomAndPlayer(socket);
    if (!ctx) return;
    const room = ctx.room;
    if (room.hostId !== socket.id) return;
    if (room.started && !room.finished) return;
    const humans = Array.from(room.players.values()).filter(p => !p.isBot && !p.disconnected);
    if (humans.length < 1) return socket.emit('error', 'В комнате должен быть хотя бы один реальный игрок');
    beginGame(room);
  });

  socket.on('restartGame', () => {
    const ctx = getRoomAndPlayer(socket);
    if (!ctx) return;
    const room = ctx.room;
    if (room.hostId !== socket.id) return;
    if (!room.finished) return;
    beginGame(room);
  });

  socket.on('rollDice', () => {
    const ctx = getRoomAndPlayer(socket);
    if (!ctx) return;
    const room = ctx.room;
    if (room.finished || room.waitingForAnswer || room.diceRolling) return;
    if (room.turnOrder.length === 0) return;
    const currentPlayerId = room.turnOrder[room.currentTurnIndex];
    if (ctx.player.id !== currentPlayerId || ctx.player.isBot) return;
    const diceValue = rollDice();
    room.currentDiceValue = diceValue;
    room.diceRolling = true;
    ctx.player.moves++;
    room.lastActivity = Date.now();
    io.to(room.id).emit('diceRolled', { value: diceValue, state: getRoomState(room) });
    setTimeout(() => {
      const currentCtx = getRoomAndPlayer(socket);
      if (!currentCtx) return;
      const r = currentCtx.room;
      if (r.finished) return;
      if (r.turnOrder[r.currentTurnIndex] !== socket.id) return;
      if (currentCtx.player.skipNext) {
        currentCtx.player.skipNext = false;
        r.virusQueue = r.virusQueue.filter(id => id !== currentCtx.player.id);
        r.diceRolling = false;
        r.currentDiceValue = 0;
        io.to(r.id).emit('turnSkipped', { playerName: currentCtx.player.name, state: getRoomState(r) });
        advanceTurn(r);
        return;
      }
      const qIdx = getRandomQuestion(r.usedQuestions);
      if (qIdx === null) {
        r.diceRolling = false;
        io.to(r.id).emit('message', { text: 'Вопросы закончились, ход передан', type: 'warning' });
        advanceTurn(r);
        return;
      }
      r.usedQuestions.push(qIdx);
      r.currentQuestion = Questions[qIdx];
      r.waitingForAnswer = true;
      r.diceRolling = false;
      io.to(r.id).emit('questionShown', {
        question: r.currentQuestion, diceValue, state: getRoomState(r)
      });
    }, 2500);
  });

  socket.on('selectAnswer', (answerIndex) => {
    const ctx = getRoomAndPlayer(socket);
    if (!ctx || !ctx.room.waitingForAnswer) return;
    if (typeof answerIndex !== 'number' || answerIndex < 0 || answerIndex > 2) return;
    const currentPlayerId = ctx.room.turnOrder[ctx.room.currentTurnIndex];
    if (ctx.player.id === currentPlayerId) {
      io.to(ctx.room.id).emit('answerSelected', { answerIndex, playerName: ctx.player.name });
    }
  });

  socket.on('answerQuestion', (chosenIndex) => {
    const ctx = getRoomAndPlayer(socket);
    if (!ctx || !ctx.room.waitingForAnswer || !ctx.room.currentQuestion) return;
    const currentPlayerId = ctx.room.turnOrder[ctx.room.currentTurnIndex];
    if (ctx.player.id !== currentPlayerId || ctx.player.isBot) return;
    if (typeof chosenIndex !== 'number' || chosenIndex < 0 || chosenIndex > 2) return;
    resolveAnswer(ctx.room, ctx.player, chosenIndex);
  });

  socket.on('reportStuck', () => {
    const ctx = getRoomAndPlayer(socket);
    if (!ctx) return;
    const room = ctx.room;
    if (!room.stuckReports) room.stuckReports = new Map();
    room.stuckReports.set(socket.id, Date.now());
    const isHost = room.hostId === socket.id;
    const reportCount = room.stuckReports.size;
    if (isHost || reportCount >= 2) {
      room.waitingForAnswer = false;
      room.diceRolling = false;
      room.currentQuestion = null;
      room.currentDiceValue = 0;
      room.botProcessing = false;
      room.currentTurnIndex = 0;
      const p = normalizeTurn(room);
      io.to(room.id).emit('turnChanged', {
        state: getRoomState(room), currentPlayerName: p ? p.name : ''
      });
      io.to(room.id).emit('message', { text: 'Состояние игры сброшено', type: 'warning' });
      room.stuckReports.clear();
      if (p && p.isBot) scheduleBotTurn(room, 1500);
    } else {
      io.to(room.id).emit('message', {
        text: `Игрок ${ctx.player.name} сообщил о зависании. Нужно ещё ${2 - reportCount} подтверждений.`,
        type: 'warning'
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Отключение:', socket.id);
    detachPlayerFromRoom(socket);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
