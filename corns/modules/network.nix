# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   Tools                   ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

{  pkgs, ... }:


# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   Network                 ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
 {
  networking = {
    nameservers = [ "1.1.1.1" "9.9.9.9" ];
    firewall.allowedTCPPorts = [ 64022 ]; # SSH 
#        firewall.extraCommands = ''
#      iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8080
#    '';
    defaultGateway = {
      address = "192.168.1.1";
      interface = "ens18";
    };
    networkmanager.enable = false;
    useDHCP = false;
  };

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   SSH                     ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
  services.openssh = {
    enable = true;
    ports = [ 64022 ];
    extraConfig = "MaxAuthTries 3 ";
    settings = {
      Banner = "${./.ssh/banner.txt}";
      PasswordAuthentication = false;
      KbdInteractiveAuthentication = false;
      PermitRootLogin = "no";
      AllowUsers = [ "vegadmin" ];
    };
  };
  services.endlessh = {
    enable = true;
    port = 22;
    openFirewall = true;
  };
  security.pam.sshAgentAuth.enable = true;
  security.pam.services.sudo.sshAgentAuth = true;

}