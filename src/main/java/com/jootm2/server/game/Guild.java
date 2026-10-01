package com.jootm2.server.game;

import java.util.ArrayList;
import java.util.List;

/**
 * A player guild, mirroring {@code TGuild} in Guild.pas (simplified to the
 * member-management and castle-ownership subset).
 */
public final class Guild {

    public String name;
    public String masterName;                       // 会长（职位 0）
    public final List<String> members = new ArrayList<>();   // 成员名（含会长）
    public final List<String> elders = new ArrayList<>();    // 长老
    public final List<String> allyGuilds = new ArrayList<>(); // 同盟行会名
    public final List<String> warGuilds = new ArrayList<>();  // 敌对（行会战）行会名
    public boolean ownsCastle = false;              // 是否沙巴克城主
    public long castleGold = 0;                     // 城收入

    public Guild(String name, String masterName) {
        this.name = name;
        this.masterName = masterName;
        this.members.add(masterName);
    }

    public boolean isMember(String playerName) {
        return members.contains(playerName);
    }

    public boolean isElder(String playerName) {
        return elders.contains(playerName);
    }

    public boolean addMember(String playerName) {
        if (isMember(playerName)) {
            return false;
        }
        members.add(playerName);
        return true;
    }

    public boolean removeMember(String playerName) {
        elders.remove(playerName);
        return members.remove(playerName);
    }

    public int memberCount() {
        return members.size();
    }
}
