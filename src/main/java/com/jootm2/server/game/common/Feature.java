package com.jootm2.server.game.common;

/**
 * Bit-packing helper ported from RACEfeature/WEAPONfeature/HAIRfeature/
 * DRESSfeature/APPRfeature and MakeFeature in Grobal2.pas.
 *
 * A 32-bit "feature" value packs four visual/status bytes:
 *   bits  0.. 7  race
 *   bits  8..15  weapon
 *   bits 16..23  hair (face in MakeFeature)
 *   bits 24..31  dress
 */
public final class Feature {

    private Feature() {
    }

    public static int makeFeature(int race, int dress, int weapon, int face) {
        int lowWord = (race & 0xFF) | ((weapon & 0xFF) << 8);
        int highWord = (face & 0xFF) | ((dress & 0xFF) << 8);
        return lowWord | (highWord << 16);
    }

    public static int race(int feature) {
        return feature & 0xFF;
    }

    public static int weapon(int feature) {
        return (feature >>> 8) & 0xFF;
    }

    public static int hair(int feature) {
        return (feature >>> 16) & 0xFF;
    }

    public static int dress(int feature) {
        return (feature >>> 24) & 0xFF;
    }
}