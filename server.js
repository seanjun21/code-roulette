const express = require('express');
const app = express();


const server = require('http').Server(app);
const io = require('socket.io')(server);

const getQuestions = require('./backend/functions/knex/get-questions');
const addUser = require('./backend/functions/knex/add-user');
const postQuestion = require('./backend/functions/knex/post-question');
const postMessage = require('./backend/functions/knex/post-message');
const filterQuestions = require('./backend/functions/knex/filter-questions');
const joinRoom = require('./backend/functions/knex/join-room');
const insertTags = require('./backend/functions/knex/insert-tags');
const answerQuestion = require('./backend/functions/knex/answer-question');

const createRoomArr = require('./backend/functions/hash-map/create-room-arr');
const findSocketIdx = require('./backend/functions/hash-map/find-socket-idx');

let spaces = {
    lobby: []
};

app.use(express.static('./build'));

// insertTags();

io.on('connection', (socket) => {
    console.log(socket.id, 'SOCKET is connected');

    // push newly connect socket into the lobby array in the hash map
    // spaces.lobby.push(socket);
    socket.emit('action', {
        type: 'findRoom'
    });
    socket.on('action', (action) => {
        console.log(action.type, '<-----ACTION.TYPE');
        if (action.type === 'server/loadRoom') {
            joinRoom(action.data).then((data) => {

                let roomKey = data.currentQuestion.questionID;

                if (!spaces[roomKey]) {
                    spaces[roomKey] = spaces[roomKey] = [];
                }

                let addSocket = true;
                spaces[roomKey].forEach((person, index) => {
                    if (socket.id === person.id) {
                        addSocket = false;
                    }
                });
                if (addSocket) {
                    spaces[roomKey].push(socket);
                }

                let roomUserArr = createRoomArr(spaces[roomKey]);

                spaces[roomKey].forEach((socket) => {
                    socket.emit('action', {
                        type: 'enterRoom',
                        data: {
                            currentQuestion: data.currentQuestion,
                            currentUsers: roomUserArr
                        }
                    })
                });
            })
        }

        if (action.type === 'server/getQuestions') {
            getQuestions().then((data) => {
                let addSocket = true;
                spaces.lobby.forEach((person, index) => {
                    if (socket.id === person.id) {
                        addSocket = false;
                    }
                });
                if (addSocket) {
                    spaces.lobby.push(socket);
                }
                let lobbyUserArr = createRoomArr(spaces.lobby);
                socket.emit('action', {
                    type: 'updateQuestionFeed',
                    data: {
                        questions: data.questions,
                        appliedFilters: [],
                        filteredFeed: false,
                        currentUsers: lobbyUserArr
                    }
                });
            });
        }
        if (action.type === 'server/addUser') {
            addUser(action.data).then((data) => {
                let lobby = spaces.lobby;
                lobby.forEach((person, index) => {
                    if (socket.id === person.id) {
                        person.userName = data.userName;
                        person.userID = data.userID;
                    }
                });
                let lobbyUserArr = createRoomArr(lobby);
                lobby.forEach((socket) => {
                    socket.emit('action', {
                        type: 'updateRoom',
                        data: {
                            currentUsers: lobbyUserArr
                        }
                    });
                });
                socket.emit('action', {
                    type: 'updateUser',
                    data: {
                        user: data
                    }
                });
            });
        }
        if (action.type === 'server/postMessage') {
            postMessage(action.data).then((data) => {
                spaces[action.data.questionID].forEach((socket) => {
                    socket.emit('action', {
                        type: 'updateMessages',
                        data: data
                    });
                });
            });
        }
        if (action.type === 'server/postQuestion') {
            postQuestion(action.data).then((data) => {
                let questionID = data.currentQuestion.questionID;
                let idx = findSocketIdx(socket.id, spaces.lobby);
                let item = spaces.lobby[idx];
                let room = [item];

                // create new 'room' in hash map for the new question
                spaces[questionID] = room;
                spaces.lobby.splice(idx, 1);
                let lobbyUserArr = createRoomArr(spaces.lobby);
                let roomUserArr = createRoomArr(room);
                spaces.lobby.forEach((socket) => {
                    socket.emit('action', {
                        type: 'updateQuestionFeed',
                        data: {
                            questions: data.questions,
                            currentUsers: lobbyUserArr
                        }
                    });
                });
                room.forEach((socket) => {
                    socket.emit('action', {
                        type: 'enterRoom',
                        data: {
                            currentQuestion: data.currentQuestion,
                            currentUsers: roomUserArr
                        }
                    });
                });
            });
        }
        if (action.type === 'server/filterQuestions') {
            filterQuestions(action.data).then((data) => {
                socket.emit('action', {
                    type: 'updateQuestionFeed',
                    data: data
                });
            });
        }

        if (action.type === 'server/answerQuestion') {
            answerQuestion(action.data).then((data) => {
                let questionID = action.data.questionID;
                spaces[questionID].forEach((socket) => {
                    spaces.lobby.push(socket);
                });
                spaces[questionID] = [];

                let lobbyUserArr = createRoomArr(spaces.lobby);
                spaces.lobby.forEach((socket) => {
                    socket.emit('action', {
                        type: 'updateQuestionFeed',
                        data: {
                            currentQuestion: data.currentQuestion,
                            currentUsers: lobbyUserArr,
                            questions: data.questions
                        }
                    });
                });
            });
        }

        if (action.type === 'server/joinRoom') {
            joinRoom(action.data).then((data) => {
                let questionID = data.currentQuestion.questionID;
                let lobby = spaces.lobby;
                let idx = findSocketIdx(socket.id, lobby);
                let item = lobby[idx];

                if (!spaces[questionID]) {
                    spaces[questionID] = [];
                }
                spaces[questionID].push(item);
                lobby.splice(idx, 1);

                let lobbyUserArr = createRoomArr(lobby);
                let roomUserArr = createRoomArr(spaces[questionID]);
                lobby.forEach((socket) => {
                    socket.emit('action', {
                        type: 'updateRoom',
                        data: {
                            currentUsers: lobbyUserArr,
                        }
                    });
                });
                spaces[questionID].forEach((socket) => {
                    socket.emit('action', {
                        type: 'enterRoom',
                        data: {
                            currentQuestion: data.currentQuestion,
                            currentUsers: roomUserArr
                        }
                    })
                });
            });
        }
    });
    socket.on('disconnect', () => {
        console.log(socket.id, '<----------socket is disconnected');
        // create rooms array of values (arrays) for each key in 'spaces' hash map
        let rooms = Object.keys(spaces);
        for (let i = 0; i < rooms.length; i += 1) {
            let room = spaces[rooms[i]];
            if (!room) {
                room = spaces[room[i]] = [];
            }
            let idx = findSocketIdx(socket.id, room);

            if (idx !== null) {
                room.splice(idx, 1);
                let roomUserArr = createRoomArr(room);
                room.forEach((socket) => {
                    socket.emit('action', {
                        type: 'updateRoom',
                        data: {
                            currentUsers: roomUserArr
                        }
                    });
                });
            }
        }
    });
});

function runServer(callback) {
    let PORT = process.env.PORT || 8080;
    server.listen(PORT, () => {
        console.log(`Listening on localhost: ${PORT}`);
        if (callback) {
            callback();
        }
    });
}

if (require.main === module) {
    runServer((err) => {
        if (err) {
            throw new Error(err);
        }
    });
}
