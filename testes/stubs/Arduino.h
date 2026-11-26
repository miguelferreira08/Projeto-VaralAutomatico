#pragma once
#include <string>
#include <cstdint>
#include <cstddef>
#include <utility>
class String:public std::string {
public:
 using std::string::string;
 using std::string::operator=;
 using std::string::operator+=;
 String(const std::string& s):std::string(s){}
 String(const char* s):std::string(s){}
 String(unsigned int x):std::string(std::to_string(x)){}
 String(int x):std::string(std::to_string(x)){}
 int indexOf(char c) const {auto r=find(c);return r==npos?-1:(int)r;}
 int indexOf(const char *x) const {auto r=find(x);return r==npos?-1:(int)r;}
 bool endsWith(const char* suffix)const{std::string st(suffix);return size()>=st.size()&&compare(size()-st.size(),st.size(),st)==0;}
};
#define INPUT_PULLUP 2
#define OUTPUT 1
#define LOW 0
#define HIGH 1
void pinMode(uint8_t,uint8_t);
void digitalWrite(uint8_t,int);
int digitalRead(uint8_t);
uint32_t millis();
void delay(unsigned int);
struct SerialClass { void begin(unsigned long);void println(const String&);void println(const char*);void print(const char*); };
extern SerialClass Serial;
