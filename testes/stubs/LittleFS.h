#pragma once
class File{public:explicit operator bool()const;bool isDirectory()const;void close();};
struct LittleFSClass{bool begin(bool);File open(const String&,const char*);};
extern LittleFSClass LittleFS;
