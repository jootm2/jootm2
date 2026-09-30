package com.jootm2.server.net;

import com.jootm2.server.service.GameService;

import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.handler.codec.http.DefaultFullHttpResponse;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.FullHttpResponse;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.HttpHeaderValues;
import io.netty.handler.codec.http.HttpMethod;
import io.netty.handler.codec.http.HttpResponseStatus;
import io.netty.handler.codec.http.HttpUtil;
import io.netty.handler.codec.http.HttpVersion;
import io.netty.handler.codec.http.QueryStringDecoder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Routes plain HTTP requests: the REST API (/api), the frontend static files (/),
 * and the Legend of Mir resource files (/resources). All responses carry CORS
 * headers so the frontend can also be hosted separately during development.
 */
public final class HttpServerHandler extends SimpleChannelInboundHandler<FullHttpRequest> {

    private final GameService gameService;
    private final Path webRoot;
    private final Path resourcesRoot;
    private final String resourcesPrefix;

    public HttpServerHandler(GameService gameService, Path webRoot, Path resourcesRoot, String resourcesPrefix) {
        this.gameService = gameService;
        this.webRoot = webRoot;
        this.resourcesRoot = resourcesRoot;
        this.resourcesPrefix = resourcesPrefix;
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, FullHttpRequest req) {
        if (!req.decoderResult().isSuccess()) {
            sendError(ctx, req, HttpResponseStatus.BAD_REQUEST);
            return;
        }

        QueryStringDecoder decoder = new QueryStringDecoder(req.uri());
        String path = decoder.path();
        Map<String, String> query = singleValues(decoder.parameters());

        if (HttpMethod.OPTIONS.equals(req.method())) {
            respond(ctx, req, emptyResponse(HttpResponseStatus.NO_CONTENT));
            return;
        }

        if (path.startsWith("/api/")) {
            handleApi(ctx, req, path, query);
        } else if (isUnder(path, resourcesPrefix)) {
            serveFile(ctx, req, path, resourcesRoot, resourcesPrefix, "resources.json");
        } else {
            serveFile(ctx, req, path, webRoot, "", "index.html");
        }
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        cause.printStackTrace();
        ctx.close();
    }

    private void handleApi(ChannelHandlerContext ctx, FullHttpRequest req, String path, Map<String, String> query) {
        byte[] body = new byte[req.content().readableBytes()];
        req.content().getBytes(0, body);
        String json = gameService.handleAdmin(req.method().name(), path, query, body);
        if (json == null) {
            sendError(ctx, req, HttpResponseStatus.NOT_FOUND);
            return;
        }
        ByteBuf buf = Unpooled.copiedBuffer(json, StandardCharsets.UTF_8);
        FullHttpResponse resp = new DefaultFullHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.OK, buf);
        resp.headers().set(HttpHeaderNames.CONTENT_TYPE, "application/json; charset=utf-8");
        respond(ctx, req, resp);
    }

    private void serveFile(ChannelHandlerContext ctx, FullHttpRequest req, String path,
                           Path root, String prefix, String defaultName) {
        String rel;
        if (prefix == null || prefix.isEmpty()) {
            rel = ("/".equals(path) || path.isEmpty()) ? defaultName : path;
        } else {
            rel = path.equals(prefix) ? defaultName : path.substring(prefix.length());
        }
        while (rel.startsWith("/")) {
            rel = rel.substring(1);
        }

        Path file = root.resolve(rel).normalize().toAbsolutePath();
        Path rootAbs = root.toAbsolutePath().normalize();
        if (!file.startsWith(rootAbs) || !Files.isRegularFile(file)) {
            sendError(ctx, req, HttpResponseStatus.NOT_FOUND);
            return;
        }

        byte[] bytes;
        try {
            bytes = Files.readAllBytes(file);
        } catch (IOException e) {
            sendError(ctx, req, HttpResponseStatus.INTERNAL_SERVER_ERROR);
            return;
        }

        String ct = contentType(file.getFileName().toString());
        String rangeHeader = req.headers().get(HttpHeaderNames.RANGE);
        if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
            long[] range = parseRange(rangeHeader, bytes.length);
            if (range != null) {
                int start = (int) range[0];
                int end = (int) range[1];
                ByteBuf buf = Unpooled.wrappedBuffer(bytes, start, end - start + 1);
                FullHttpResponse resp = new DefaultFullHttpResponse(
                        HttpVersion.HTTP_1_1, HttpResponseStatus.PARTIAL_CONTENT, buf);
                resp.headers().set(HttpHeaderNames.CONTENT_TYPE, ct);
                resp.headers().set(HttpHeaderNames.ACCEPT_RANGES, "bytes");
                resp.headers().set(HttpHeaderNames.CONTENT_RANGE,
                        "bytes " + start + "-" + end + "/" + bytes.length);
                respond(ctx, req, resp);
                return;
            }
        }

        ByteBuf buf = Unpooled.wrappedBuffer(bytes);
        FullHttpResponse resp = new DefaultFullHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.OK, buf);
        resp.headers().set(HttpHeaderNames.CONTENT_TYPE, ct);
        resp.headers().set(HttpHeaderNames.ACCEPT_RANGES, "bytes");
        respond(ctx, req, resp);
    }

    /** Parses {@code bytes=start-end} / {@code bytes=start-} / {@code bytes=-suffix}. */
    private static long[] parseRange(String header, long fileSize) {
        String spec = header.substring("bytes=".length()).trim();
        int dash = spec.indexOf('-');
        if (dash < 0 || fileSize <= 0) {
            return null;
        }
        String startStr = spec.substring(0, dash).trim();
        String endStr = spec.substring(dash + 1).trim();
        long start;
        long end;
        try {
            if (startStr.isEmpty()) {
                long suffix = Long.parseLong(endStr);
                if (suffix <= 0) {
                    return null;
                }
                start = Math.max(0, fileSize - suffix);
                end = fileSize - 1;
            } else {
                start = Long.parseLong(startStr);
                end = endStr.isEmpty() ? fileSize - 1 : Long.parseLong(endStr);
            }
        } catch (NumberFormatException e) {
            return null;
        }
        if (start < 0 || start >= fileSize || end < start) {
            return null;
        }
        end = Math.min(end, fileSize - 1);
        return new long[]{start, end};
    }
private void respond(ChannelHandlerContext ctx, FullHttpRequest req, FullHttpResponse resp) {
        resp.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_ORIGIN, "*");
        resp.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, OPTIONS");
        resp.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_HEADERS, "*");
        resp.headers().setInt(HttpHeaderNames.CONTENT_LENGTH, resp.content().readableBytes());

        if (HttpUtil.isKeepAlive(req)) {
            resp.headers().set(HttpHeaderNames.CONNECTION, HttpHeaderValues.KEEP_ALIVE);
            ctx.writeAndFlush(resp);
        } else {
            ctx.writeAndFlush(resp).addListener(ChannelFutureListener.CLOSE);
        }
    }

    private void sendError(ChannelHandlerContext ctx, FullHttpRequest req, HttpResponseStatus status) {
        ByteBuf buf = Unpooled.copiedBuffer(status.toString(), StandardCharsets.UTF_8);
        FullHttpResponse resp = new DefaultFullHttpResponse(HttpVersion.HTTP_1_1, status, buf);
        resp.headers().set(HttpHeaderNames.CONTENT_TYPE, "text/plain; charset=utf-8");
        respond(ctx, req, resp);
    }

    private static FullHttpResponse emptyResponse(HttpResponseStatus status) {
        return new DefaultFullHttpResponse(HttpVersion.HTTP_1_1, status);
    }

    private static boolean isUnder(String path, String prefix) {
        if (prefix == null || prefix.isEmpty()) {
            return false;
        }
        return path.equals(prefix) || path.startsWith(prefix + "/");
    }

    private static Map<String, String> singleValues(Map<String, List<String>> params) {
        Map<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<String, List<String>> e : params.entrySet()) {
            List<String> values = e.getValue();
            if (values != null && !values.isEmpty()) {
                out.put(e.getKey(), values.get(0));
            }
        }
        return out;
    }

    private static String contentType(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".html")) return "text/html; charset=utf-8";
        if (n.endsWith(".css")) return "text/css; charset=utf-8";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "application/javascript; charset=utf-8";
        if (n.endsWith(".json")) return "application/json; charset=utf-8";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }
}