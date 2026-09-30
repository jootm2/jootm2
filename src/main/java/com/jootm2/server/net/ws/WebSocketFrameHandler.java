package com.jootm2.server.net.ws;

import com.jootm2.server.service.GameService;
import com.jootm2.server.service.PlayerSession;

import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame;
import io.netty.handler.codec.http.websocketx.PingWebSocketFrame;
import io.netty.handler.codec.http.websocketx.PongWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketFrame;

/**
 * Handles WebSocket frames for the game protocol and doubles as the
 * {@link PlayerSession} transport abstraction used by {@link GameService}.
 */
public final class WebSocketFrameHandler extends SimpleChannelInboundHandler<WebSocketFrame>
        implements PlayerSession {

    private final GameService gameService;
    private ChannelHandlerContext ctx;
    private long accountId = -1;
    private String playerName;

    public WebSocketFrameHandler(GameService gameService) {
        this.gameService = gameService;
    }

    @Override
    public void channelActive(ChannelHandlerContext ctx) {
        this.ctx = ctx;
        ctx.fireChannelActive();
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, WebSocketFrame frame) {
        this.ctx = ctx;
        if (frame instanceof TextWebSocketFrame) {
            gameService.onMessage(this, ((TextWebSocketFrame) frame).text());
        } else if (frame instanceof PingWebSocketFrame) {
            ctx.writeAndFlush(new PongWebSocketFrame(frame.content().retain()));
        } else if (frame instanceof CloseWebSocketFrame) {
            ctx.close();
        }
        // BinaryWebSocketFrame and others are unused by this protocol.
    }

    @Override
    public void channelInactive(ChannelHandlerContext ctx) {
        gameService.onDisconnect(this);
        ctx.fireChannelInactive();
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        cause.printStackTrace();
        ctx.close();
    }

    // ---- PlayerSession -----------------------------------------------------

    @Override
    public void sendText(String text) {
        if (ctx != null && ctx.channel().isActive()) {
            ctx.channel().writeAndFlush(new TextWebSocketFrame(text));
        }
    }

    @Override
    public void close() {
        if (ctx != null) {
            ctx.close();
        }
    }

    @Override
    public long getAccountId() {
        return accountId;
    }

    @Override
    public void setAccountId(long id) {
        this.accountId = id;
    }

    @Override
    public String getPlayerName() {
        return playerName;
    }

    @Override
    public void setPlayerName(String name) {
        this.playerName = name;
    }
}