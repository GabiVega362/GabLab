# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   Tools                   ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

{ pkgs, lib, ... }:

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                   Users                   ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

{
  users.mutableUsers = false;
  users.users.vegadmin = {
    isNormalUser = true;
    extraGroups = [ "wheel" ]; # Enable ‘sudo’ for the user.
    packages = with pkgs; [
      tree wget curl 
    ];
    hashedPassword = "!";
    openssh.authorizedKeys.keys = lib.strings.splitString "\n" (lib.strings.trim (builtins.readFile ./.ssh/authorized_keys));
  };
  users.users.root.hashedPassword = "!";
  
  nix.settings.trusted-users = [ "root" "@wheel" ];

}