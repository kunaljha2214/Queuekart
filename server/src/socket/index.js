/**
 * Socket.io: clients join `shop:<shopId>` to receive queue:update broadcasts.
 */
function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('shop:join', (shopId) => {
      if (shopId && typeof shopId === 'string') {
        socket.join(`shop:${shopId}`);
      }
    });

    socket.on('shop:leave', (shopId) => {
      if (shopId && typeof shopId === 'string') {
        socket.leave(`shop:${shopId}`);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
