package com.jootm2.server.game.common;

/**
 * Legacy numeric message identifiers ported from Grobal2.pas.
 *
 * The rewritten HTML5 client speaks JSON over WebSocket (see the protocol
 * documentation), so these values are retained for reference and for the
 * optional binary gate codec. They are kept 1:1 with the Delphi constants so
 * that game logic can be traced back to the original source.
 */
public final class MessageIds {

    private MessageIds() {
    }

    // -- object / actor kinds ------------------------------------------------
    public static final int OS_MOVINGOBJECT = 1;
    public static final int OS_ITEMOBJECT = 2;
    public static final int OS_EVENTOBJECT = 3;
    public static final int OS_GATEOBJECT = 4;
    public static final int OS_SWITCHOBJECT = 5;
    public static final int OS_MAPEVENT = 6;
    public static final int OS_DOOR = 7;
    public static final int OS_ROON = 8;

    // -- area flags ----------------------------------------------------------
    public static final int AREA_FIGHT = 0x01;
    public static final int AREA_SAFE = 0x02;
    public static final int AREA_FREEPK = 0x04;

    // -- map cell walkability ------------------------------------------------
    public static final int MP_CANMOVE = 0;
    public static final int MP_WALL = 1;
    public static final int MP_HIGHWALL = 2;

    // -- race codes ----------------------------------------------------------
    public static final int RC_USERHUMAN = 0;
    public static final int RC_NPC = 10;
    public static final int RC_DOORGUARD = 11;
    public static final int RC_PEACENPC = 15;
    public static final int RC_ARCHERPOLICE = 20;
    public static final int RC_ANIMAL = 50;
    public static final int RC_WOLF = 53;
    public static final int RC_MONSTER = 80;
    public static final int RC_SCORPION = 84;
    public static final int RC_SKELETON = 86;

    // -- equipment slots (U_*) ----------------------------------------------
    public static final int U_DRESS = 0;
    public static final int U_WEAPON = 1;
    public static final int U_RIGHTHAND = 2;
    public static final int U_NECKLACE = 3;
    public static final int U_HELMET = 4;
    public static final int U_ARMRINGL = 5;
    public static final int U_ARMRINGR = 6;
    public static final int U_RINGL = 7;
    public static final int U_RINGR = 8;
    public static final int U_BUJUK = 9;
    public static final int U_BELT = 10;
    public static final int U_BOOTS = 11;
    public static final int U_CHARM = 12;

    // -- admin levels --------------------------------------------------------
    public static final int UD_USER = 0;
    public static final int UD_OBSERVER = 2;
    public static final int UD_SYSOP = 3;
    public static final int UD_ADMIN = 4;
    public static final int UD_SUPERADMIN = 5;

    // -- server -> client (SM_*) --------------------------------------------
    public static final int SM_TEST = 1;
    public static final int SM_STOPACTIONS = 2;
    public static final int SM_THROW = 5;
    public static final int SM_RUSH = 6;
    public static final int SM_RUSHKUNG = 7;
    public static final int SM_FIREHIT = 8;
    public static final int SM_BACKSTEP = 9;
    public static final int SM_TURN = 10;
    public static final int SM_WALK = 11;
    public static final int SM_SITDOWN = 12;
    public static final int SM_RUN = 13;
    public static final int SM_HIT = 14;
    public static final int SM_HEAVYHIT = 15;
    public static final int SM_BIGHIT = 16;
    public static final int SM_SPELL = 17;
    public static final int SM_POWERHIT = 18;
    public static final int SM_LONGHIT = 19;
    public static final int SM_DIGUP = 20;
    public static final int SM_DIGDOWN = 21;
    public static final int SM_FLYAXE = 22;
    public static final int SM_LIGHTING = 23;
    public static final int SM_WIDEHIT = 24;
    public static final int SM_CROSSHIT = 35;

    public static final int SM_DIE = 26;
    public static final int SM_ALIVE = 27;
    public static final int SM_MOVEFAIL = 28;
    public static final int SM_HIDE = 29;
    public static final int SM_DISAPPEAR = 30;
    public static final int SM_STRUCK = 31;
    public static final int SM_DEATH = 32;
    public static final int SM_SKELETON = 33;
    public static final int SM_NOWDEATH = 34;

    public static final int SM_HEAR = 40;
    public static final int SM_FEATURECHANGED = 41;
    public static final int SM_USERNAME = 42;
    public static final int SM_WINEXP = 44;
    public static final int SM_LEVELUP = 45;
    public static final int SM_DAYCHANGING = 46;

    public static final int SM_LOGON = 50;
    public static final int SM_NEWMAP = 51;
    public static final int SM_ABILITY = 52;
    public static final int SM_HEALTHSPELLCHANGED = 53;
    public static final int SM_MAPDESCRIPTION = 54;

    public static final int SM_SYSMESSAGE = 100;
    public static final int SM_GROUPMESSAGE = 101;
    public static final int SM_CRY = 102;
    public static final int SM_WHISPER = 103;
    public static final int SM_GUILDMESSAGE = 104;

    public static final int SM_ADDITEM = 200;
    public static final int SM_BAGITEMS = 201;
    public static final int SM_DELITEM = 202;
    public static final int SM_UPDATEITEM = 203;
    public static final int SM_ADDMAGIC = 210;
    public static final int SM_SENDMYMAGIC = 211;
    public static final int SM_DELMAGIC = 212;

    public static final int SM_VERSION_AVAILABLE = 500;
    public static final int SM_VERSION_FAIL = 501;
    public static final int SM_PASSWD_SUCCESS = 502;
    public static final int SM_PASSWD_FAIL = 503;
    public static final int SM_NEWID_SUCCESS = 504;
    public static final int SM_NEWID_FAIL = 505;
    public static final int SM_CHGPASSWD_SUCCESS = 506;
    public static final int SM_CHGPASSWD_FAIL = 507;

    public static final int SM_SELECTSERVER_OK = 530;
    public static final int SM_SELECTSERVER_FAIL = 531;
    public static final int SM_QUERYCHR = 532;
    public static final int SM_STARTPLAY = 533;
    public static final int SM_NEWCHR_OK = 534;
    public static final int SM_NEWCHR_FAIL = 535;
    public static final int SM_DELCHR_OK = 536;
    public static final int SM_DELCHR_FAIL = 537;

    public static final int SM_SPACEMOVE_HIDE = 800;
    public static final int SM_SPACEMOVE_SHOW = 801;
    public static final int SM_RECONNECT = 802;
    public static final int SM_GHOST = 803;
    public static final int SM_SHOWEVENT = 804;
    public static final int SM_HIDEEVENT = 805;
    public static final int SM_SPACEMOVE_HIDE2 = 806;
    public static final int SM_SPACEMOVE_SHOW2 = 807;

    public static final int SM_OPENHEALTH = 1100;
    public static final int SM_CLOSEHEALTH = 1101;
    public static final int SM_BREAKWEAPON = 1102;
    public static final int SM_CHANGEFACE = 1104;

    // -- client -> server (CM_*) --------------------------------------------
    public static final int CM_PROTOCOL = 2000;
    public static final int CM_IDPASSWORD = 2001;
    public static final int CM_ADDNEWUSER = 2002;
    public static final int CM_CHANGEPASSWORD = 2003;
    public static final int CM_UPDATEUSER = 2004;

    public static final int CM_QUERYCHR = 100;
    public static final int CM_NEWCHR = 101;
    public static final int CM_DELCHR = 102;
    public static final int CM_SELCHR = 103;
    public static final int CM_SELECTSERVER = 104;

    public static final int CM_THROW = 3005;
    public static final int CM_TURN = 3010;
    public static final int CM_WALK = 3011;
    public static final int CM_SITDOWN = 3012;
    public static final int CM_RUN = 3013;
    public static final int CM_HIT = 3014;
    public static final int CM_HEAVYHIT = 3015;
    public static final int CM_BIGHIT = 3016;
    public static final int CM_SPELL = 3017;
    public static final int CM_POWERHIT = 3018;
    public static final int CM_LONGHIT = 3019;
    public static final int CM_WIDEHIT = 3024;
    public static final int CM_FIREHIT = 3025;
    public static final int CM_SAY = 3030;
    public static final int CM_CROSSHIT = 3035;

    public static final int CM_QUERYUSERNAME = 80;
    public static final int CM_QUERYBAGITEMS = 81;
    public static final int CM_QUERYUSERSTATE = 82;

    public static final int CM_DROPITEM = 1000;
    public static final int CM_PICKUP = 1001;
    public static final int CM_OPENDOOR = 1002;
}