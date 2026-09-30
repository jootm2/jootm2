package com.jootm2.server.net;

import com.jootm2.server.net.ws.WebSocketFrameHandler;
import com.jootm2.server.service.GameService;

import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.Channel;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.ChannelOption;
import io.netty.channel.ChannelPipeline;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.http.HttpObjectAggregator;
import io.netty.handler.codec.http.HttpServerCodec;
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler;

import java.nio.file.Path;

/**
 * Netty-based single-port server that multiplexes the frontend static files,
 * the REST API (/api) and the WebSocket game protocol (/ws).
 */
public final class NettyServer {

    private final GameService gameService;
    private final Path webRoot;
    private final Path resourcesRoot;
    private final String resourcesPrefix;

    private EventLoopGroup bossGroup;
    private EventLoopGroup workerGroup;
    private Channel serverChannel;

    public NettyServer(GameService gameService, Path webRoot, Path resourcesRoot, String resourcesPrefix) {
        this.gameService = gameService;
        this.webRoot = webRoot;
        this.resourcesRoot = resourcesRoot;
        this.resourcesPrefix = resourcesPrefix;
    }

    public void start(int port, int ioThreads, int backlog) throws InterruptedException {
        bossGroup = new NioEventLoopGroup(1);
        workerGroup = new NioEventLoopGroup(Math.max(1, ioThreads));

        ServerBootstrap b = new ServerBootstrap();
        b.group(bossGroup, workerGroup)
                .channel(NioServerSocketChannel.class)
                .option(ChannelOption.SO_BACKLOG, backlog)
                .childOption(ChannelOption.TCP_NODELAY, true)
                .childOption(ChannelOption.SO_KEEPALIVE, true)
                .childHandler(new ChannelInitializer<SocketChannel>() {
                    @Override
                    protected void initChannel(SocketChannel ch) {
                        ChannelPipeline p = ch.pipeline();
                        p.addLast(new HttpServerCodec());
                        p.addLast(new HttpObjectAggregator(1024 * 1024));
                        p.addLast(new WebSocketServerProtocolHandler("/ws", null, false));
                        p.addLast(new HttpServerHandler(gameService, webRoot, resourcesRoot, resourcesPrefix));
                        p.addLast(new WebSocketFrameHandler(gameService));
                    }
                });

        serverChannel = b.bind(port).sync().channel();
    }

    public void close() {
        if (serverChannel != null) {
            serverChannel.close();
            serverChannel = null;
        }
        if (bossGroup != null) {
            bossGroup.shutdownGracefully();
            bossGroup = null;
        }
        if (workerGroup != null) {
            workerGroup.shutdownGracefully();
            workerGroup = null;
        }
    }
}