// Forwards a loopback port to the local PostgreSQL with a fixed delay each way, so every statement
// pays a remote database's round trip (the production database is PlanetScale, not loopback).
import net from 'node:net';

const [listenPort, targetPort, roundTripMs] = process.argv.slice(2).map(Number);
const oneWayMs = roundTripMs / 2;

const delayed = (from: net.Socket, to: net.Socket) => {
    from.on('data', chunk => {
        setTimeout(() => to.write(chunk), oneWayMs);
    });
    from.on('end', () => setTimeout(() => to.end(), oneWayMs));
    from.on('error', () => to.destroy());
};

net.createServer(client => {
    const server = net.connect(targetPort, '127.0.0.1');
    client.setNoDelay(true);
    server.setNoDelay(true);
    delayed(client, server);
    delayed(server, client);
}).listen(listenPort, '127.0.0.1', () => {
    console.log(`db-latency-proxy ${listenPort} -> ${targetPort} rtt=${roundTripMs}ms`);
});
