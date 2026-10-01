package com.jootm2.server.game;

import java.util.ArrayList;
import java.util.List;

/**
 * A player party, mirroring the {@code GroupOwner / GroupMembers} structure of
 * {@code TCreature} in ObjBase.pas. The first member is the leader.
 */
public final class Party {

    public final List<Long> memberIds = new ArrayList<>();   // Player.id（首项为队长）

    public Party(long leaderId) {
        memberIds.add(leaderId);
    }

    public long leaderId() {
        return memberIds.get(0);
    }

    public boolean contains(long playerId) {
        return memberIds.contains(playerId);
    }

    public int size() {
        return memberIds.size();
    }
}
