{ config, lib, pkgs, ... }:

    # ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    # ┃                 WireGuard                 ┃
    # ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
{
    age.secrets."wireguard.key".file = ./key.age;
    age.secrets."wireguard-peers".file = ./peers.conf.age;

    networking.wireguard = {
    enable = true;
    interfaces."wireguard" = {
        ips = [ "10.10.10.254/24" ];
        listenPort = 51820;
        privateKeyFile = config.age.secrets."wireguard.key".path;
        peers = [];
            postSetup = ''
            ${pkgs.wireguard-tools}/bin/wg addconf wireguard ${config.age.secrets."wireguard-peers".path}
            '';
        };
        };
}