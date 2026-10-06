# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   Tools                   ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
{  pkgs, ... }:

{
# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   Apps                    ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    imports =
    [ 
      ../../modules/disko.nix
      ../../modules/users.nix
      ../../modules/network.nix
      ../../modules/boot.nix
      ./.pairdrop/pairdrop.nix
      ./.welcome/welcome.nix
    ];


# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                 Network                   ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
    
    networking = {
    firewall.allowedTCPPorts = [ 64022 ]; # SSH | 
        firewall.extraCommands = ''
            iptables -I INPUT 1 -p tcp -s 192.168.1.3 --dport 8080 -j ACCEPT
            iptables -I INPUT 1 -p tcp -s 192.168.1.3 --dport 8081 -j ACCEPT
          '';
    };

    networking.interfaces = {
      ens18 = { # Local Network
        ipv4.addresses = [{
          address = "192.168.1.4";
          prefixLength = 24;
        }];
      };
    };

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   BOOT                    ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

networking.hostName = "spidernet-gablab"; # Define your hostname.

}