{ pkgs, ... }:

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                 Services                  ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
{
    virtualisation.docker.enable = true;
    systemd.services.docker = {
        requires = [ "firewall.service" ];
        after = [ "firewall.service" ];
    };
    environment.etc."rakazo/compose.yaml".source = ./docker-compose.images.yml;

    systemd.services.rakazo = {
        description = "Mis esclavos";
        wantedBy = [ "multi-user.target" ];
        requires = [ "docker.service" ];
        after = [ "docker.service" ];
        environment = {
            API_URL = "https://esbirros.gablab.wtf";
            BETTER_AUTH_URL = "https://esbirros.gablab.wtf";
            WEB_ORIGIN = "https://esbirros.gablab.wtf";
            RAKAZO_HOST = "esbirros.gablab.wtf";
            RAKAZO_WEB_BIND = "10.10.20.10";
            # Un ordenador de bot a la vez: 3 x 2 GiB no caben en esta VM de 4 GiB.
            SANDBOX_MAX_COMPUTERS_PER_USER = "1";
            # Duerme el ordenador ocioso a los 5 minutos en vez de 10.
            SANDBOX_IDLE_MS = "300000";
            # Clon compartido de solo lectura; se refresca desde el host, no desde los bots.
            SANDBOX_COMPUTER_MOUNTS = "/var/lib/rakazo/shared:/mnt/shared:ro";
        };
        serviceConfig = {
            Type = "oneshot";
            RemainAfterExit = true;
            WorkingDirectory = "/var/lib/rakazo";
            ExecStart = "${pkgs.docker-compose}/bin/docker-compose --env-file /var/lib/rakazo/rakazo.env -f /etc/rakazo/compose.yaml up -d";
            ExecStop = "${pkgs.docker-compose}/bin/docker-compose --env-file /var/lib/rakazo/rakazo.env -f /etc/rakazo/compose.yaml stop";
            TimeoutStopSec = "55min";
        };
    };

    systemd.services.rakazo-documentary-supervisor = {
        requires = [ "rakazo.service" ];
        after = [ "rakazo.service" ];
        serviceConfig = {
            Type = "exec";
            RuntimeMaxSec = 21900;
            ExecStart = "${pkgs.docker}/bin/docker exec -u 1000:1000 rakazo-api-1 /usr/bin/timeout --signal=TERM --kill-after=30s 21800s node --import tsx /data/documentary-supervisor/supervisor.mjs /data/documentary-supervisor/config.json";
            ExecStop = "-${pkgs.docker}/bin/docker exec -u 1000:1000 rakazo-api-1 /usr/bin/pkill -TERM -f '^node --import tsx /data/documentary-supervisor/supervisor[.]mjs /data/documentary-supervisor/config[.]json$'";
        };
    };
    systemd.timers.rakazo-documentary-supervisor = {
        wantedBy = [ "timers.target" ];
        timerConfig = {
            OnCalendar = "*-*-* 06:05:00 Europe/Madrid";
            Persistent = true;
        };
    };

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                 Network                   ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

    networking.firewall.extraCommands = ''
        # Contenedores: sin conexiones nuevas hacia la propia VM.
        ip46tables -I nixos-fw 1 -i docker0 -m conntrack ! --ctstate ESTABLISHED,RELATED -j DROP
        ip46tables -I nixos-fw 1 -i br+ -m conntrack ! --ctstate ESTABLISHED,RELATED -j DROP

        # Preparar la cadena incluso si Docker todavia no ha arrancado.
        iptables -w -nL DOCKER-USER >/dev/null 2>&1 ||
            iptables -w -N DOCKER-USER

        # shortcut: solo web IPv4 en 5173 y bridges estandar; revisar si cambia la publicacion.
        iptables -w -C DOCKER-USER -i ens18 ! -s 10.10.20.1 -p tcp --dport 5173 -m conntrack --ctdir ORIGINAL -j DROP 2>/dev/null ||
            iptables -w -I DOCKER-USER 1 -i ens18 ! -s 10.10.20.1 -p tcp --dport 5173 -m conntrack --ctdir ORIGINAL -j DROP
    '';
}