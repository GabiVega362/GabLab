# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   Tools                   ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

{  config, pkgs, ... }:

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   Apps                    ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

{
  imports =
    [ 
      ../../modules/disko.nix
      ../../modules/users.nix
      ../../modules/network.nix
      ../../modules/boot.nix
      ./.pihole/pi-hole.nix
      ./.caddy/caddy.nix
      ./.wireguard/wireguard.nix
    ];

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                 Network                   ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    networking.interfaces = {
      ens18 = { # Local Network
        ipv4.addresses = [{
          address = "192.168.1.3";
          prefixLength = 24;
        }];
      };
    };

    boot.kernel.sysctl = {
    "net.ipv4.ip_forward" = 1;
    "net.ipv6.conf.all.forwarding" = 1;
    "net.ipv4.conf.all.rp_filter" = 1;
    "net.ipv4.conf.default.rp_filter" = 1;
    };
     # Desactivar el firewall tradicional y NAT de NixOS para evitar colisiones con nftables
    networking.firewall.enable = false;
    networking.nat.enable = false;

    networking.nftables = {
        enable = true;
        ruleset = builtins.readFile ./.nftables/tables.nft;
    };

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   BOOT                    ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

  networking.hostName = "router-gablab"; # Define your hostname.

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                  SECRETS                  ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

  age.secrets."acme.env".file = ./.caddy/acme.env.age;

  security.acme = {
        acceptTerms = true;
        defaults.email = "vegadmin@gablab.wtf";
        certs."gablab.wtf" = {
          domain = "gablab.wtf";
          extraDomainNames = [ "*.gablab.wtf" ];
          dnsProvider = "cloudflare";
          dnsResolver = "1.1.1.1:53";
          environmentFile = config.age.secrets."acme.env".path;
          group = config.services.caddy.group;
        };
      };
}