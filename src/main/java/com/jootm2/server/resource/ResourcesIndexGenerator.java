package com.jootm2.server.resource;

import com.google.gson.JsonObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Regenerates {@code resources.json} by scanning the Legend of Mir resource root
 * (Data / Map / Wav). This mirrors the behaviour of the original
 * JootM2ResourceServer.mjs, so the index is always derived from the files that
 * are actually on disk and never goes stale.
 */
public final class ResourcesIndexGenerator {

    private ResourcesIndexGenerator() {
    }

    public static void generate(Path resourceRoot) throws IOException {
        if (!Files.isDirectory(resourceRoot)) {
            System.err.println("[resources] resource root not found: " + resourceRoot);
            return;
        }

        Path dataDir = findDir(resourceRoot, "data");
        Path mapDir = findDir(resourceRoot, "map");
        Path wavDir = findDir(resourceRoot, "wav");
        if (dataDir == null || mapDir == null || wavDir == null) {
            System.err.println("[resources] Data/Map/Wav not found under " + resourceRoot
                    + ", skip resources.json generation");
            return;
        }

        JsonObject root = new JsonObject();
        root.add("images", buildImages(dataDir));
        root.add("maps", buildSimpleIndex(mapDir, "map"));
        root.add("wavs", buildSimpleIndex(wavDir, "wav"));

        Path out = resourceRoot.resolve("resources.json");
        Files.write(out, root.toString().getBytes(StandardCharsets.UTF_8));
        System.out.println("[resources] generated " + out);
    }

    /**
     * Maps each image library index (.wix / .wzx) to its library file (.wil / .wzl),
     * keyed by the lower-cased base name, e.g. {@code chrsel -> {x, l}}.
     */
    private static JsonObject buildImages(Path dataDir) throws IOException {
        String dirName = dataDir.getFileName().toString();
        List<String> allFiles = listFiles(dataDir);

        List<String> indexFiles = allFiles.stream()
                .filter(n -> lower(n).endsWith(".wix") || lower(n).endsWith(".wzx"))
                .sorted()
                .collect(Collectors.toList());

        JsonObject images = new JsonObject();
        for (String indexFile : indexFiles) {
            String base = lower(baseName(indexFile));
            for (String f : allFiles) {
                String lf = lower(f);
                if (lf.equals(base + ".wil") || lf.equals(base + ".wzl")) {
                    JsonObject lib = new JsonObject();
                    lib.addProperty("x", dirName + "/" + indexFile);
                    lib.addProperty("l", dirName + "/" + f);
                    images.add(base, lib);
                    break;
                }
            }
        }
        return images;
    }

    /** Maps each {@code .ext} file to {@code dirName/file}, keyed by lower-cased base name. */
    private static JsonObject buildSimpleIndex(Path dir, String ext) throws IOException {
        String dirName = dir.getFileName().toString();
        JsonObject map = new JsonObject();
        listFiles(dir).stream()
                .filter(n -> lower(n).endsWith("." + ext))
                .sorted()
                .forEach(n -> map.addProperty(lower(baseName(n)), dirName + "/" + n));
        return map;
    }

    private static List<String> listFiles(Path dir) throws IOException {
        try (Stream<Path> s = Files.list(dir)) {
            return s.map(p -> p.getFileName().toString()).collect(Collectors.toList());
        }
    }

    private static Path findDir(Path root, String name) throws IOException {
        try (Stream<Path> s = Files.list(root)) {
            return s.filter(Files::isDirectory)
                    .filter(p -> p.getFileName().toString().equalsIgnoreCase(name))
                    .findFirst()
                    .orElse(null);
        }
    }

    private static String lower(String s) {
        return s.toLowerCase(Locale.ROOT);
    }

    private static String baseName(String fileName) {
        int dot = fileName.indexOf('.');
        return dot >= 0 ? fileName.substring(0, dot) : fileName;
    }
}