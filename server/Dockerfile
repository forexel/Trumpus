FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /bin/server ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=build /bin/server /app/server
EXPOSE 8000
CMD ["/app/server"]
