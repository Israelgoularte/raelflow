FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/raelflow.conf

EXPOSE 80
